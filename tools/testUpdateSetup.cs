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
    static TestUpdateSetup()
    {
        // The standalone .NET Framework executable can otherwise negotiate legacy TLS.
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
    }

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

    private static bool HasClient(string folder)
    {
        return (File.Exists(Path.Combine(folder, "DFO Online Mod.exe")) || File.Exists(Path.Combine(folder, "DFO 13.11.exe")) || File.Exists(Path.Combine(folder, "DFO Test Build.exe")))
            && File.Exists(Path.Combine(folder, "resources", "app.asar"))
            && (File.Exists(Path.Combine(folder, "DFO Online Mod.exe")) || File.Exists(Path.Combine(folder, "resources", "game-seed.asar")));
    }

    private static string ClientFolder(string folder)
    {
        foreach (var candidate in new[] { Path.Combine(folder, "DFO Test Build"), Path.Combine(folder, "client", "DFO Test Build") })
            if (File.Exists(Path.Combine(candidate, "DFO Test Build.exe")) && HasClient(candidate)) return candidate;
        var nested = Path.Combine(folder, "client");
        return HasClient(nested) ? nested : folder;
    }

    private static string ChooseDestination()
    {
        var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
        var previousFolder = Path.Combine(programs, "DFO Online 13.11");
        var defaultFolder = Path.Combine(programs, "DFO Test Build");
        foreach (var candidate in new[] { defaultFolder, Path.Combine(programs, "dfo-1311-test"), previousFolder })
            if (HasClient(ClientFolder(candidate))) { defaultFolder = candidate; break; }
        using (var window = new Form())
        {
            window.Text = "DFO Test Build Setup";
            window.FormBorderStyle = FormBorderStyle.FixedDialog;
            window.AutoScaleMode = AutoScaleMode.Font;
            window.Font = System.Drawing.SystemFonts.MessageBoxFont;
            window.ClientSize = new System.Drawing.Size(590, 335);
            window.StartPosition = FormStartPosition.CenterScreen;
            window.MinimizeBox = window.MaximizeBox = false;

            var heading = new Label { Text = "Install DFO Test Build", AutoSize = true,
                Font = new System.Drawing.Font(window.Font.FontFamily, 17, System.Drawing.FontStyle.Bold) };
            heading.SetBounds(24, 21, 535, 31);
            var clean = new RadioButton { Text = "New installation", Checked = !HasClient(ClientFolder(defaultFolder)) };
            clean.SetBounds(24, 68, 535, 23);
            var repair = new RadioButton { Text = "Check and update an existing installation", Checked = !clean.Checked };
            repair.SetBounds(24, 99, 535, 23);
            var pathLabel = new Label { Text = "Installation folder", AutoSize = true };
            pathLabel.SetBounds(24, 145, 535, 20);
            var path = new TextBox { Text = defaultFolder, AccessibleName = pathLabel.Text };
            path.SetBounds(24, 168, 440, 24);
            var browse = new Button { Text = "Browse…" };
            browse.SetBounds(473, 165, 91, 27);
            var note = new Label { AccessibleName = "Folder status" };
            note.SetBounds(24, 207, 540, 66);
            var next = new Button { Text = "Install" };
            next.SetBounds(356, 284, 116, 30);
            var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel };
            cancel.SetBounds(481, 284, 83, 30);
            string destination = null;
            MethodInvoker validate = delegate {
                destination = null;
                next.Text = repair.Checked ? "Check and update" : "Install";
                try
                {
                    var input = path.Text.Trim().Trim('"');
                    if (!Path.IsPathRooted(input)) throw new IOException("Enter a full path or select a folder with Browse.");
                    var folder = new DirectoryInfo(Path.GetFullPath(input));
                    if (folder.Parent == null || File.Exists(folder.FullName))
                        throw new IOException("Choose a folder for the client.");
                    if (repair.Checked)
                    {
                        var client = ClientFolder(folder.FullName);
                        if (!HasClient(client)) throw new IOException("Select the DFO Test Build folder or its parent containing the client folder.");
                        destination = client;
                        note.Text = "Client found: " + client + "\nSetup updates the launcher and reuses matching game files.";
                    }
                    else
                    {
                        if (folder.Exists && Directory.GetFileSystemEntries(folder.FullName).Length != 0)
                            throw new IOException("Choose an empty or new folder. To update DFO in place, select the existing installation option.");
                        destination = folder.FullName;
                        note.Text = "Setup downloads the base client. Enter the test invitation and install EMC in the launcher.";
                    }
                }
                catch (Exception error)
                {
                    if (!(error is IOException || error is ArgumentException || error is UnauthorizedAccessException || error is NotSupportedException)) throw;
                    note.Text = error.Message;
                }
                next.Enabled = destination != null;
            };
            clean.CheckedChanged += delegate { validate(); };
            repair.CheckedChanged += delegate { validate(); };
            path.TextChanged += delegate { validate(); };
            browse.Click += delegate {
                using (var picker = new FolderBrowserDialog())
                {
                    picker.Description = repair.Checked ? "Select the existing DFO Test Build client." : "Select an empty installation folder.";
                    picker.ShowNewFolderButton = !repair.Checked;
                    if (Directory.Exists(path.Text)) picker.SelectedPath = path.Text;
                    if (picker.ShowDialog(window) == DialogResult.OK) path.Text = picker.SelectedPath;
                }
            };
            next.Click += delegate { validate(); if (destination != null) window.DialogResult = DialogResult.OK; };
            window.AcceptButton = next;
            window.CancelButton = cancel;
            window.Controls.AddRange(new Control[] { heading, clean, repair, pathLabel, path, browse, note, next, cancel });
            validate();
            return window.ShowDialog() == DialogResult.OK ? destination : null;
        }
    }

    private static string Install(string destination, string localAssets, string token, Action<string> status)
    {
        string[] config;
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("setup.txt"))
        using (var reader = new StreamReader(stream))
            config = reader.ReadToEnd().Split('\n');
        if (config.Length == 3 && config[2].StartsWith("DFO-Test-Build-Client.exe ", StringComparison.Ordinal))
        {
            var isLegacyClient = File.Exists(Path.Combine(destination, "DFO Online Mod.exe"));
            var target = isLegacyClient ? Path.Combine(destination, "DFO Test Build") : destination;
            if (isLegacyClient && Directory.Exists(target) && Directory.GetFileSystemEntries(target).Length != 0 && !HasClient(target))
                throw new IOException("A different folder already exists at " + target);
            var temp = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N")));
            try
            {
                status("Preparing the launcher…");
                var api = "https://api.github.com/repos/principialnostb/daggerfall-js-source/releases";
                var list = localAssets == null ? ReleaseAssets(api, config[1], null) : null;
                var installer = Download(api, list, null, config[2], temp.FullName, localAssets);
                var start = new ProcessStartInfo(installer, "/S") { UseShellExecute = false };
                start.EnvironmentVariables["DFO_TEST_MASTER_DESTINATION"] = target;
                using (var proc = Process.Start(start))
                {
                    proc.WaitForExit();
                    if (proc.ExitCode != 0 || !File.Exists(Path.Combine(target, "DFO Test Build.exe")))
                        throw new IOException("Launcher installation did not finish (exit " + proc.ExitCode + ") in " + target);
                }
                return target;
            }
            finally { temp.Delete(true); }
        }

        var publicInstall = config[0].StartsWith("public:", StringComparison.Ordinal);
        if (publicInstall) destination = ClientFolder(destination);
        else
        {
            var nested = Path.Combine(destination, "client");
            if (File.Exists(Path.Combine(nested, "DFO Online Mod.exe"))) destination = nested;
        }
        var root = new DirectoryInfo(Path.GetFullPath(destination));
        if (root.Parent == null) throw new IOException("Choose a folder for DFO, not the drive root.");
        var legacy = Path.Combine(root.FullName, "resources", "app.asar");
        var current = Path.Combine(root.FullName, "resources", "game-seed.asar");
        string seed = null;
        status("Checking installed files…");
        if (File.Exists(current))
        {
            var hash = Digest(current);
            if (hash == config[3] || hash == config[4]) seed = current;
        }
        if (seed == null && File.Exists(legacy) && Digest(legacy) == config[3]) seed = legacy;
        if (seed == null && root.Exists && Directory.GetFileSystemEntries(root.FullName).Length != 0 && !(publicInstall && HasClient(root.FullName)))
            throw new IOException("Choose an empty folder or the issued DFO Test Build client folder.");

        var stage = Path.Combine(root.Parent.FullName, ".dfo-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        try
        {
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
            status("Installing DFO Test Build…");
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
        using (var heading = new Label())
        using (var description = new Label())
        using (var label = new Label())
        using (var input = new TextBox())
        using (var github = new Button())
        using (var next = new Button())
        using (var cancel = new Button())
        {
            window.Text = "DFO Test Build Setup";
            window.ClientSize = new System.Drawing.Size(510, 258);
            window.Font = System.Drawing.SystemFonts.MessageBoxFont;
            window.FormBorderStyle = FormBorderStyle.FixedDialog;
            window.StartPosition = FormStartPosition.CenterScreen;
            window.MaximizeBox = false;
            window.MinimizeBox = false;
            heading.Text = "Choose your test access";
            heading.Font = new System.Drawing.Font(window.Font.FontFamily, 16, System.Drawing.FontStyle.Bold);
            heading.SetBounds(22, 18, 470, 32);
            description.Text = "Testers enter the invitation from a developer. Developers sign in with GitHub. Setup then downloads and installs the client.";
            description.SetBounds(23, 55, 460, 46);
            label.Text = "Test invitation code";
            label.SetBounds(23, 109, 460, 19);
            input.SetBounds(23, 131, 460, 28);
            input.MaxLength = 48;
            github.Text = "Sign in with GitHub";
            github.SetBounds(23, 177, 160, 30);
            github.DialogResult = DialogResult.Yes;
            next.Text = "Next >";
            next.SetBounds(318, 213, 78, 29);
            next.Enabled = false;
            next.DialogResult = DialogResult.OK;
            input.TextChanged += delegate { next.Enabled = input.Text.Trim().Length == 48; };
            cancel.Text = "Cancel";
            cancel.SetBounds(405, 213, 78, 29);
            cancel.DialogResult = DialogResult.Cancel;
            window.AcceptButton = next;
            window.CancelButton = cancel;
            window.Controls.AddRange(new Control[] { heading, description, label, input, github, next, cancel });
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


    private static string AskToken(bool invite)
    {
        using (var window = new Form())
        using (var prompt = new Label())
        using (var input = new TextBox())
        using (var accept = new Button())
        {
            window.Text = "DFO Test Build Update Access";
            window.Width = 440;
            window.Height = 150;
            window.StartPosition = FormStartPosition.CenterScreen;
            prompt.Text = invite ? "Enter the test invitation code." : "Enter a GitHub token with read access to the private test releases.";
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

    private static void OpenLauncher(string folder, string token, bool service)
    {
        var info = new ProcessStartInfo(Path.Combine(folder, File.Exists(Path.Combine(folder, "DFO Test Build.exe")) ? "DFO Test Build.exe" : "DFO Online Mod.exe"));
        info.WorkingDirectory = folder;
        info.UseShellExecute = false;
        if (token != null) info.EnvironmentVariables[service ? "DFO_1311_ACCESS_SESSION" : "DFO_1311_INSTALL_TOKEN"] = token;
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
        var service = InstallSource();
        var publicInstall = service != null && service.StartsWith("public:", StringComparison.Ordinal);
        var inherited = Environment.GetEnvironmentVariable("DFO_1311_SETUP_SESSION");
        Environment.SetEnvironmentVariable("DFO_1311_SETUP_SESSION", null);
        var access = publicInstall ? null : service == null ? AskToken(false) : inherited ?? AskAccess();
        if (!publicInstall && String.IsNullOrWhiteSpace(access)) return 0;
        var destination = ChooseDestination();
        if (destination == null) return 0;
        var token = access;
        var authenticated = publicInstall || service == null || inherited != null;
        using (var window = new Form())
        using (var message = new Label())
        using (var progress = new ProgressBar())
        using (var worker = new BackgroundWorker())
        {
            window.Text = "DFO Test Build Setup";
            window.Width = 460;
            window.Height = 169;
            window.StartPosition = FormStartPosition.CenterScreen;
            window.ControlBox = false;
            message.Dock = DockStyle.Top;
            message.Height = 63;
            message.Text = "Preparing DFO Test Build…\n" + destination;
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
                    token = Authorize(service, access, status);
                    authenticated = true;
                }
                argsResult.Result = Install(destination, null, token, status);
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
                if (result.Error == null) OpenLauncher((string)result.Result, token, service != null);
                window.DialogResult = result.Error == null ? DialogResult.OK : DialogResult.Abort;
            };
            window.Shown += delegate { worker.RunWorkerAsync(); };
            return window.ShowDialog() == DialogResult.OK ? 0 : 1;
        }
    }
}
