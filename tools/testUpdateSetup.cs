using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows.Forms;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.Web.Script.Serialization;

internal static class TestUpdateSetup
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateHardLink(string newFile, string existingFile, IntPtr reserved);

    private static string Digest(string file)
    {
        using (var stream = File.OpenRead(file))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private sealed class ReleaseAsset
    {
        public string name { get; set; }
        public long id { get; set; }
        public string browser_download_url { get; set; }
    }

    private sealed class Release
    {
        public ReleaseAsset[] assets { get; set; }
    }

    private static WebClient GitHub(string token, string accept)
    {
        var web = new WebClient();
        web.Headers[HttpRequestHeader.UserAgent] = "DFO-13.11-Setup";
        if (!String.IsNullOrEmpty(token)) web.Headers[HttpRequestHeader.Authorization] = "Bearer " + token;
        web.Headers[HttpRequestHeader.Accept] = accept;
        return web;
    }

    private static Dictionary<string, ReleaseAsset> ReleaseAssets(string release, string tag, string token)
    {
        using (var web = GitHub(token, "application/vnd.github+json"))
        {
            var json = web.DownloadString(release + "/tags/" + tag);
            var result = new JavaScriptSerializer().Deserialize<Release>(json);
            var assets = new Dictionary<string, ReleaseAsset>(StringComparer.Ordinal);
            foreach (var asset in result.assets) assets.Add(asset.name, asset);
            return assets;
        }
    }

    private static string Download(string release, Dictionary<string, ReleaseAsset> assets, string token, string row, string stage, string localAssets)
    {
        var asset = row.Split(' ');
        var file = Path.Combine(stage, asset[0]);
        if (localAssets != null)
            File.Copy(Path.Combine(localAssets, asset[0]), file);
        else
            using (var web = GitHub(token, "application/octet-stream"))
            {
                var item = assets[asset[0]];
                var target = release + "/assets/" + item.id;
                if (String.IsNullOrEmpty(token))
                {
                    target = item.browser_download_url;
                    if (!target.StartsWith("https://github.com/principialnostb/daggerfall-js-source/releases/download/", StringComparison.Ordinal))
                        throw new IOException("Unexpected public release download.");
                }
                web.DownloadFile(target, file);
            }
        if (Digest(file) != asset[1]) throw new IOException("Checksum failed for " + asset[0]);
        return file;
    }

    private static string Install(string destination, string localAssets, string token, Action<string> status)
    {
        string[] config;
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("setup.txt"))
        using (var reader = new StreamReader(stream))
            config = reader.ReadToEnd().Split('\n');

        var nested = Path.Combine(destination, "client");
        if (File.Exists(Path.Combine(nested, "DFO Online Mod.exe"))) destination = nested;
        var root = new DirectoryInfo(Path.GetFullPath(destination));
        if (root.Parent == null) throw new IOException("Choose a folder for DFO, not the drive root.");
        var legacy = Path.Combine(root.FullName, "resources", "app.asar");
        var current = Path.Combine(root.FullName, "resources", "game-seed.asar");
        string seed = null;
        if (File.Exists(current))
        {
            var hash = Digest(current);
            if (hash == config[3] || hash == config[4]) seed = current;
        }
        if (seed == null && File.Exists(legacy) && Digest(legacy) == config[3]) seed = legacy;
        if (seed == null && root.Exists && Directory.GetFileSystemEntries(root.FullName).Length != 0)
            throw new IOException("Choose an empty folder or the issued DFO 13.11 client folder.");

        var stage = Path.Combine(root.Parent.FullName, ".dfo-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        try
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            status("Downloading the launcher…");
            var endpoint = config[0].StartsWith("https://", StringComparison.Ordinal) ? config[0] + "/releases" : "https://api.github.com/repos/" + config[0] + "/releases";
            if (config[0].StartsWith("public:", StringComparison.Ordinal))
                endpoint = "https://api.github.com/repos/" + config[0].Substring(7) + "/releases";
            var assets = localAssets == null ? ReleaseAssets(endpoint, config[1], token) : null;
            var archive = Download(endpoint, assets, token, config[2], stage, localAssets);
            var payload = Path.Combine(stage, "client");
            ZipFile.ExtractToDirectory(archive, payload);
            var installedSeed = Path.Combine(payload, "resources", "game-seed.asar");
            if (seed == null)
            {
                using (var output = File.Create(installedSeed))
                    for (int index = 5; index < config.Length; index++)
                    {
                        status("Downloading game resources (" + (index - 4) + " of " + (config.Length - 5) + ")…");
                        var part = Download(endpoint, assets, token, config[index], stage, localAssets);
                        using (var input = File.OpenRead(part)) input.CopyTo(output);
                        File.Delete(part);
                    }
                if (Digest(installedSeed) != config[4]) throw new IOException("Game archive checksum failed.");
            }
            status("Installing DFO 13.11…");
            if (seed != null && !CreateHardLink(installedSeed, seed, IntPtr.Zero))
                File.Copy(seed, installedSeed);
            Swap(root, payload);
            return root.FullName;
        }
        finally
        {
            try { Directory.Delete(stage, true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static void Swap(DirectoryInfo root, string payload)
    {
        var backup = root.FullName + ".before-update-" + Guid.NewGuid().ToString("N").Substring(0, 8);
        bool oldMoved = false;
        try
        {
            if (root.Exists)
            {
                Directory.Move(root.FullName, backup);
                oldMoved = true;
            }
            Directory.Move(payload, root.FullName);
        }
        catch
        {
            if (oldMoved) Directory.Move(backup, root.FullName);
            throw;
        }
    }

    private static string InstallSource()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("setup.txt"))
        using (var reader = new StreamReader(stream))
        {
            var source = reader.ReadLine();
            return source.StartsWith("https://", StringComparison.Ordinal) || source.StartsWith("public:", StringComparison.Ordinal) ? source : null;
        }
    }

    private static string AskAccess()
    {
        using (var window = new Form())
        using (var prompt = new Label())
        using (var input = new TextBox())
        using (var github = new Button())
        using (var invite = new Button())
        {
            window.Text = "DFO 13.11 Test Access";
            window.Width = 440;
            window.Height = 165;
            window.StartPosition = FormStartPosition.CenterScreen;
            prompt.Text = "Tester invitation code";
            prompt.Dock = DockStyle.Top;
            input.MaxLength = 48;
            input.Dock = DockStyle.Top;
            github.Text = "Sign in with GitHub · developers";
            github.DialogResult = DialogResult.Yes;
            github.Dock = DockStyle.Bottom;
            invite.Text = "Use invitation";
            invite.DialogResult = DialogResult.OK;
            invite.Dock = DockStyle.Bottom;
            window.AcceptButton = invite;
            window.Controls.Add(input);
            window.Controls.Add(prompt);
            window.Controls.Add(github);
            window.Controls.Add(invite);
            var result = window.ShowDialog();
            return result == DialogResult.Yes ? "github" : result == DialogResult.OK ? input.Text.Trim() : null;
        }
    }

    private static Dictionary<string, object> Post(string service, string path, object body)
    {
        var serializer = new JavaScriptSerializer();
        using (var web = new WebClient())
        {
            web.Headers[HttpRequestHeader.ContentType] = "application/json";
            return serializer.Deserialize<Dictionary<string, object>>(
                web.UploadString(service + path, "POST", serializer.Serialize(body)));
        }
    }

    private static string Authorize(string service, string access, Action<string> status)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        if (access != "github")
            return (string)Post(service, "/access/invite", new { code = access })["token"];
        var start = Post(service, "/access/github/start", new { });
        status("Enter on GitHub: " + start["code"]);
        Process.Start("https://github.com/login/device");
        var interval = (int)start["interval"];
        var expires = DateTime.UtcNow.AddSeconds((int)start["expires"]);
        while (DateTime.UtcNow < expires)
        {
            System.Threading.Thread.Sleep(interval * 1000);
            var result = Post(service, "/access/github/poll", new { ticket = start["ticket"] });
            if (result.ContainsKey("token")) return (string)result["token"];
            interval = (int)result["interval"];
        }
        throw new IOException("GitHub sign-in expired. Open Setup again.");
    }


    private static string CheckInvite(string code)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[0-9a-f]{48}$"))
            throw new IOException("Invalid test invitation code.");
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        string hash;
        using (var sha = SHA256.Create())
            hash = BitConverter.ToString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(code))).Replace("-", "").ToLowerInvariant();
        const string roster = "https://raw.githubusercontent.com/principialnostb/daggerfall-js-source/13.11-build/test-channel/13.11-invites.json";
        using (var web = new WebClient())
        {
            var rows = new JavaScriptSerializer().Deserialize<Dictionary<string, string>[]>(web.DownloadString(roster));
            foreach (var row in rows)
                if (row["hash"] == hash) return hash;
        }
        throw new IOException("Test invitation is unavailable.");
    }


    private static string AskToken(bool invite)
    {
        using (var window = new Form())
        using (var prompt = new Label())
        using (var input = new TextBox())
        using (var accept = new Button())
        {
            window.Text = "DFO 13.11 Update Access";
            window.Width = 440;
            window.Height = 150;
            window.StartPosition = FormStartPosition.CenterScreen;
            prompt.Text = invite ? "Enter the 13.11 test invitation code." : "Enter a GitHub token with read access to the private test releases.";
            prompt.Dock = DockStyle.Top;
            prompt.Height = 32;
            input.UseSystemPasswordChar = true;
            input.Dock = DockStyle.Top;
            accept.Text = "Continue";
            accept.DialogResult = DialogResult.OK;
            accept.Dock = DockStyle.Bottom;
            window.AcceptButton = accept;
            window.Controls.Add(input);
            window.Controls.Add(prompt);
            window.Controls.Add(accept);
            return window.ShowDialog() == DialogResult.OK ? input.Text.Trim() : null;
        }
    }

    private static void OpenLauncher(string folder, string token, bool service, string inviteHash)
    {
        var info = new ProcessStartInfo(Path.Combine(folder, "DFO Online Mod.exe"));
        info.WorkingDirectory = folder;
        info.UseShellExecute = false;
        if (inviteHash != null) info.EnvironmentVariables["DFO_1311_PUBLIC_INVITE_HASH"] = inviteHash;
        else if (token != null) info.EnvironmentVariables[service ? "DFO_1311_ACCESS_SESSION" : "DFO_1311_INSTALL_TOKEN"] = token;
        Process.Start(info);
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "--local-install")
        {
            try { Install(args[1], args[2], null, delegate { }); return 0; }
            catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        }

        Application.EnableVisualStyles();
        using (var folder = new FolderBrowserDialog())
        {
            folder.Description = "Choose the DFO 13.11 client folder or an empty folder for a new installation.";
            if (folder.ShowDialog() != DialogResult.OK) return 0;
            var service = InstallSource();
            var publicInstall = service != null && service.StartsWith("public:", StringComparison.Ordinal);
            var inherited = Environment.GetEnvironmentVariable("DFO_1311_SETUP_SESSION");
            Environment.SetEnvironmentVariable("DFO_1311_SETUP_SESSION", null);
            var access = publicInstall ? AskToken(true) : service == null ? AskToken(false) : inherited ?? AskAccess();
            if (String.IsNullOrWhiteSpace(access)) return 0;
            var token = access;
            var authenticated = service == null || (!publicInstall && inherited != null);
            string inviteHash = null;
            using (var window = new Form())
            using (var message = new Label())
            using (var progress = new ProgressBar())
            using (var worker = new BackgroundWorker())
            {
                window.Text = "DFO 13.11 Setup";
                window.Width = 460;
                window.Height = 135;
                window.StartPosition = FormStartPosition.CenterScreen;
                window.ControlBox = false;
                message.Dock = DockStyle.Top;
                message.Height = 38;
                message.Text = "Checking the selected folder…";
                progress.Style = ProgressBarStyle.Marquee;
                progress.Dock = DockStyle.Bottom;
                window.Controls.Add(message);
                window.Controls.Add(progress);
                worker.DoWork += delegate(object sender, DoWorkEventArgs argsResult)
                {
                    Action<string> status = delegate(string text)
                    {
                        window.BeginInvoke((MethodInvoker)delegate { message.Text = text; });
                    };
                    if (!authenticated)
                    {
                        if (publicInstall) { inviteHash = CheckInvite(access); token = null; }
                        else token = Authorize(service, access, status);
                        authenticated = true;
                    }
                    argsResult.Result = Install(folder.SelectedPath, null, token, status);
                };
                worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs result)
                {
                    if (result.Error != null && authenticated && service != null)
                    {
                        var retry = MessageBox.Show(window, result.Error.Message, window.Text, MessageBoxButtons.RetryCancel, MessageBoxIcon.Error);
                        if (retry == DialogResult.Retry) { worker.RunWorkerAsync(); return; }
                        window.DialogResult = DialogResult.Abort;
                        return;
                    }
                    MessageBox.Show(window, result.Error == null
                        ? "Installation complete. The launcher will open now."
                        : result.Error.Message, window.Text, MessageBoxButtons.OK,
                        result.Error == null ? MessageBoxIcon.Information : MessageBoxIcon.Error);
                    if (result.Error == null) OpenLauncher((string)result.Result, token, service != null, inviteHash);
                    window.DialogResult = result.Error == null ? DialogResult.OK : DialogResult.Abort;
                };
                window.Shown += delegate { worker.RunWorkerAsync(); };
                return window.ShowDialog() == DialogResult.OK ? 0 : 1;
            }
        }
    }
}
