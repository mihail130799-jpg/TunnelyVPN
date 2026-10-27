// Небольшой системный помощник Tunnely.
// Команды:
//   proxy on <host:port> <bypass>   включить системный прокси Windows
//   proxy off                        выключить системный прокси
//   proxy status                     вывести текущее состояние
//   isadmin                          код выхода 0, если процесс запущен с правами администратора
//   elevate <exe> [args...]          запустить программу с запросом прав администратора (UAC)
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32;

static class TunnelyHelper
{
    [DllImport("wininet.dll", SetLastError = true)]
    static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

    const int INTERNET_OPTION_SETTINGS_CHANGED = 39;
    const int INTERNET_OPTION_REFRESH = 37;
    const int INTERNET_OPTION_PROXY_SETTINGS_CHANGED = 95;
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0) return Usage();
            switch (args[0])
            {
                case "proxy":
                    if (args.Length >= 2 && args[1] == "off") return ProxyOff(args.Length >= 3 ? args[2] : null, args.Length >= 4 ? args[3] : null);
                    if (args.Length >= 2 && args[1] == "json") return ProxyJson();
                    if (args.Length >= 2 && args[1] == "status") return ProxyStatus();
                    if (args.Length >= 3 && args[1] == "on") return ProxyOn(args[2], args.Length >= 4 ? args[3] : "<local>");
                    return Usage();
                case "isadmin":
                    return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator) ? 0 : 1;
                case "elevate":
                    if (args.Length < 2) return Usage();
                    return Elevate(args);
                default:
                    return Usage();
            }
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e.Message);
            return 2;
        }
    }

    static int Usage()
    {
        Console.Error.WriteLine("usage: proxy on <host:port> [bypass] | proxy off | proxy status | isadmin | elevate <exe> [args]");
        return 64;
    }

    static void Notify()
    {
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_PROXY_SETTINGS_CHANGED, IntPtr.Zero, 0);
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
    }

    static int ProxyOn(string server, string bypass)
    {
        using (var k = Registry.CurrentUser.OpenSubKey(Key, true))
        {
            k.SetValue("ProxyServer", server, RegistryValueKind.String);
            k.SetValue("ProxyOverride", bypass, RegistryValueKind.String);
            k.SetValue("ProxyEnable", 1, RegistryValueKind.DWord);
        }
        Notify();
        return 0;
    }

    // Выключает прокси; если переданы прежние значения — возвращает их на место
    static int ProxyOff(string server, string bypass)
    {
        using (var k = Registry.CurrentUser.OpenSubKey(Key, true))
        {
            k.SetValue("ProxyEnable", 0, RegistryValueKind.DWord);
            if (server != null) k.SetValue("ProxyServer", server, RegistryValueKind.String);
            if (bypass != null) k.SetValue("ProxyOverride", bypass, RegistryValueKind.String);
        }
        Notify();
        return 0;
    }

    static string J(object v)
    {
        var s = (v ?? "").ToString();
        return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    static int ProxyJson()
    {
        using (var k = Registry.CurrentUser.OpenSubKey(Key, false))
        {
            Console.WriteLine("{\"enabled\":" + (Convert.ToInt32(k.GetValue("ProxyEnable", 0)) == 1 ? "true" : "false")
                + ",\"server\":" + J(k.GetValue("ProxyServer", ""))
                + ",\"bypass\":" + J(k.GetValue("ProxyOverride", "")) + "}");
        }
        return 0;
    }

    static int ProxyStatus()
    {
        using (var k = Registry.CurrentUser.OpenSubKey(Key, false))
        {
            var enabled = Convert.ToInt32(k.GetValue("ProxyEnable", 0)) == 1;
            Console.WriteLine((enabled ? "on " : "off ") + (k.GetValue("ProxyServer", "") ?? ""));
        }
        return 0;
    }

    static int Elevate(string[] args)
    {
        var rest = new string[args.Length - 2];
        Array.Copy(args, 2, rest, 0, rest.Length);
        var psi = new ProcessStartInfo(args[1])
        {
            UseShellExecute = true,
            Verb = "runas",
            Arguments = string.Join(" ", Array.ConvertAll(rest, Quote))
        };
        try
        {
            Process.Start(psi);
            return 0;
        }
        catch (System.ComponentModel.Win32Exception e)
        {
            // 1223 = пользователь нажал «Нет» в окне UAC
            return e.NativeErrorCode == 1223 ? 3 : 2;
        }
    }

    static string Quote(string s)
    {
        if (s.Length > 0 && s.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return s;
        return "\"" + s.Replace("\\\"", "\\\\\"").Replace("\"", "\\\"") + "\"";
    }
}
