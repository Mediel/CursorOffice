/// <summary>
/// Converts Cursor/VS Code workspace roots into filesystem paths.
/// Cursor 3.18 sends URI paths such as <c>/c:/Users/...</c> on Windows.
/// </summary>
public static class WorkspacePathNormalizer
{
    public static string Normalize(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var trimmed = path.Trim();

        if (trimmed.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
            && Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            && uri.IsFile)
        {
            trimmed = uri.LocalPath;
        }

        if (trimmed.Length >= 3
            && trimmed[0] is '/' or '\\'
            && char.IsAsciiLetter(trimmed[1])
            && trimmed[2] == ':')
        {
            trimmed = $"{char.ToUpperInvariant(trimmed[1])}:{trimmed[3..]}";
        }
        else if (trimmed.Length >= 2
            && char.IsAsciiLetter(trimmed[0])
            && trimmed[1] == ':')
        {
            trimmed = $"{char.ToUpperInvariant(trimmed[0])}{trimmed[1..]}";
        }

        try
        {
            return Path.GetFullPath(trimmed)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch (Exception exception) when (exception is ArgumentException
            or NotSupportedException
            or PathTooLongException)
        {
            return trimmed.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
    }
}
