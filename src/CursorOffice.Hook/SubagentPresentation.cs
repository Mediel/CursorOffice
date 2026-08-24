using System.Globalization;
using System.Text.RegularExpressions;

/// <summary>
/// Builds privacy-bounded labels from Cursor's documented subagent metadata.
/// The full parent prompt and the subagent result are never used.
/// </summary>
public static partial class SubagentPresentation
{
    public static string FormatType(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var separated = CamelCaseBoundary().Replace(value, " ")
            .Replace('-', ' ')
            .Replace('_', ' ');
        var normalized = NormalizeWhitespace(separated);
        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(normalized);
    }

    public static string FormatDisplayName(string agentType, string agentId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(agentId);
        var shortId = agentId.Length > 6 ? agentId[..6] : agentId;
        return $"{FormatType(agentType)} {shortId}";
    }

    public static string? FormatActivity(string? value, int maximumLength = 140)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }
        ArgumentOutOfRangeException.ThrowIfLessThan(maximumLength, 12);
        var safeCharacters = new string(value
            .Select(character => char.IsControl(character) ? ' ' : character)
            .ToArray());
        var normalized = NormalizeWhitespace(safeCharacters);
        if (normalized.Length <= maximumLength)
        {
            return normalized;
        }
        var prefix = normalized[..(maximumLength - 1)].TrimEnd();
        var wordBoundary = prefix.LastIndexOf(' ');
        if (wordBoundary >= maximumLength / 2)
        {
            prefix = prefix[..wordBoundary];
        }
        return $"{prefix}…";
    }

    private static string NormalizeWhitespace(string value) =>
        Whitespace().Replace(value, " ").Trim();

    [GeneratedRegex(@"(?<=[\p{Ll}\p{Nd}])(?=\p{Lu})", RegexOptions.CultureInvariant)]
    private static partial Regex CamelCaseBoundary();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex Whitespace();
}
