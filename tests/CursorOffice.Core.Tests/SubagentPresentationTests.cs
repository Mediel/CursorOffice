namespace CursorOffice.Core.Tests;

public sealed class SubagentPresentationTests
{
    [Theory]
    [InlineData("generalPurpose", "General Purpose")]
    [InlineData("tech-lead", "Tech Lead")]
    [InlineData("code_reviewer", "Code Reviewer")]
    public void FormatType_ProducesReadableRole(string source, string expected)
    {
        Assert.Equal(expected, SubagentPresentation.FormatType(source));
    }

    [Fact]
    public void FormatDisplayName_KeepsRoleAndStableShortIdentity()
    {
        Assert.Equal("Tech Lead abcdef", SubagentPresentation.FormatDisplayName("techLead", "abcdefgh-1234"));
    }

    [Fact]
    public void FormatActivity_CollapsesLinesAndBoundsStoredText()
    {
        var result = SubagentPresentation.FormatActivity("  Analyze\r\n  checkout   validation  ", 24);

        Assert.Equal("Analyze checkout…", result);
    }
}
