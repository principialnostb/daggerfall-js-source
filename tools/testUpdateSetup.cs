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
    }

    private sealed class Release
    {
        public ReleaseAsset[] assets { get; set; }
    }

    private static WebClient GitHub(string token, string accept)
    {
        var web = new WebClient();
        web.Headers[HttpRequestHeader.UserAgent] = "DFO-13.11-Setup";
        web.Headers[HttpRequestHeader.Authorization] = "Bearer " + token;
        web.Headers[HttpRequestHeader.Accept] = accept;
        return web;
    }

    private static Dictionary<string, long> ReleaseAssets(string release, string tag, string token)
    {
        using (var web = GitHub(token, "application/vnd.github+json"))
        {
            var json = web.DownloadString(release + "/tags/" + tag);
            var result = new JavaScriptSerializer().Deserialize<Release>(json);
            var assets = new Dictionary<string, long>(StringComparer.Ordinal);
            foreach (var asset in result.assets) assets.Add(asset.name, asset.id);
            return assets;
        }
    }

    private static string Download(string release, Dictionary<string, long> assets, string token, string row, string stage, string localAssets)
    {
        var asset = row.Split(' ');
        var file = Path.Combine(stage, asset[0]);
        if (localAssets != null)
            File.Copy(Path.Combine(localAssets, asset[0]), file);
        else
            using (var web = GitHub(token, "application/octet-stream"))
                web.DownloadFile(release + "/assets/" + assets[asset[0]], file);
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
            var endpoint = "https://api.github.com/repos/" + config[0] + "/releases";
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

    private static string AskToken()
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
            prompt.Text = "Enter a GitHub token with read access to the private test releases.";
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

    private static void OpenLauncher(string folder, string token)
    {
        var info = new ProcessStartInfo(Path.Combine(folder, "DFO Online Mod.exe"));
        info.WorkingDirectory = folder;
        info.UseShellExecute = false;
        info.EnvironmentVariables["DFO_1311_INSTALL_TOKEN"] = token;
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
            var token = AskToken();
            if (String.IsNullOrWhiteSpace(token)) return 0;
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
                    argsResult.Result = Install(folder.SelectedPath, null, token, delegate(string text)
                    {
                        window.BeginInvoke((MethodInvoker)delegate { message.Text = text; });
                    });
                };
                worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs result)
                {
                    MessageBox.Show(window, result.Error == null
                        ? "Installation complete. The launcher will open now."
                        : result.Error.Message, window.Text, MessageBoxButtons.OK,
                        result.Error == null ? MessageBoxIcon.Information : MessageBoxIcon.Error);
                    if (result.Error == null) OpenLauncher((string)result.Result, token);
                    window.DialogResult = result.Error == null ? DialogResult.OK : DialogResult.Abort;
                };
                window.Shown += delegate { worker.RunWorkerAsync(); };
                return window.ShowDialog() == DialogResult.OK ? 0 : 1;
            }
        }
    }
}
