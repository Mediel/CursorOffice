using System.Text.RegularExpressions;

/// <summary>
/// Produces a short team name without reading project files. Git metadata is
/// preferred because cloned source folders often contain versions or "Source".
/// </summary>
public static partial class WorkspaceNameResolver
{
    public static string Resolve(string workspaceRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRoot);
        return NormalizeDisplayName(TryReadOriginRepositoryName(workspaceRoot)
            ?? Path.GetFileName(workspaceRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)));
    }

    public static string NormalizeDisplayName(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var name = value.EndsWith(".git", StringComparison.OrdinalIgnoreCase)
            ? value[..^4]
            : value;
        name = SourceSuffixPattern().Replace(name, string.Empty).Trim(' ', '.', '_', '-');
        if (name.Length > 1 && char.IsLower(name[0]) && name.Skip(1).Any(char.IsUpper))
        {
            name = $"{char.ToUpperInvariant(name[0])}{name[1..]}";
        }
        return string.IsNullOrWhiteSpace(name) ? value : name;
    }

    private static string? TryReadOriginRepositoryName(string workspaceRoot)
    {
        var configPath = TryGetGitConfigPath(workspaceRoot);
        if (configPath is null || !File.Exists(configPath))
        {
            return null;
        }

        try
        {
            var inOrigin = false;
            foreach (var rawLine in File.ReadLines(configPath))
            {
                var line = rawLine.Trim();
                if (line.StartsWith("[", StringComparison.Ordinal))
                {
                    inOrigin = string.Equals(line, "[remote \"origin\"]", StringComparison.OrdinalIgnoreCase);
                    continue;
                }
                if (!inOrigin || !line.StartsWith("url", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                var separator = line.IndexOf('=');
                if (separator < 0)
                {
                    continue;
                }
                var url = line[(separator + 1)..].Trim().TrimEnd('/', '\\');
                var nameStart = url.LastIndexOfAny(['/', '\\', ':']);
                var name = nameStart >= 0 ? url[(nameStart + 1)..] : url;
                return string.IsNullOrWhiteSpace(name) ? null : name;
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return null;
        }
        return null;
    }

    private static string? TryGetGitConfigPath(string workspaceRoot)
    {
        var dotGit = Path.Combine(workspaceRoot, ".git");
        if (Directory.Exists(dotGit))
        {
            return Path.Combine(dotGit, "config");
        }
        if (!File.Exists(dotGit))
        {
            return null;
        }

        try
        {
            var pointer = File.ReadLines(dotGit).FirstOrDefault();
            const string prefix = "gitdir:";
            if (pointer is null || !pointer.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
            var gitDirectory = pointer[prefix.Length..].Trim();
            if (!Path.IsPathRooted(gitDirectory))
            {
                gitDirectory = Path.GetFullPath(Path.Combine(workspaceRoot, gitDirectory));
            }
            var directConfig = Path.Combine(gitDirectory, "config");
            if (File.Exists(directConfig))
            {
                return directConfig;
            }
            var commonDirectoryPointer = Path.Combine(gitDirectory, "commondir");
            if (!File.Exists(commonDirectoryPointer))
            {
                return null;
            }
            var commonDirectory = File.ReadAllText(commonDirectoryPointer).Trim();
            if (!Path.IsPathRooted(commonDirectory))
            {
                commonDirectory = Path.GetFullPath(Path.Combine(gitDirectory, commonDirectory));
            }
            return Path.Combine(commonDirectory, "config");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }
    }

    [GeneratedRegex(@"(?:[._-]+v?\d+(?:[._-]\d+)*)?[._-]+(?:source|src)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SourceSuffixPattern();
}
