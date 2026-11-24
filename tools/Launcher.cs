using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    private static bool SameContent(Stream embedded, string target)
    {
        if (!File.Exists(target)) return false;
        using (SHA256 sha = SHA256.Create())
        using (Stream current = File.OpenRead(target))
        {
            string expected = Convert.ToBase64String(sha.ComputeHash(embedded));
            embedded.Position = 0;
            return expected == Convert.ToBase64String(sha.ComputeHash(current));
        }
    }

    internal static string Materialize(string directory)
    {
        Directory.CreateDirectory(directory);
        string target = Path.Combine(directory, "Studio.html");
        using (var mutex = new Mutex(false, @"Local\ChembenchStudioLauncher"))
        using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.html"))
        {
            if (embedded == null) throw new FileNotFoundException("Studio.html");
            try { mutex.WaitOne(); } catch (AbandonedMutexException) { }
            try
            {
                if (SameContent(embedded, target)) return target;
                string temp = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    using (var output = File.Create(temp)) embedded.CopyTo(output);
                    if (File.Exists(target)) File.Replace(temp, target, null); else File.Move(temp, target);
                }
                finally { if (File.Exists(temp)) File.Delete(temp); }
            }
            finally { mutex.ReleaseMutex(); }
        }
        return target;
    }

    [STAThread]
    private static void Main()
    {
        try
        {
            string parent = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string target = Materialize(Path.Combine(parent, "Chembench Studio"));
            Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Chembench Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
