namespace CursorOffice.Core.Tests;

public sealed class WorkspacePathNormalizerTests
{
    [Theory]
    [InlineData("/c:/Users/erdtM/source/repos/CursorOffice", @"C:\Users\erdtM\source\repos\CursorOffice")]
    [InlineData("/C:/Users/erdtM/source/repos/CursorOffice", @"C:\Users\erdtM\source\repos\CursorOffice")]
    [InlineData(@"C:\Users\erdtM\source\repos\CursorOffice", @"C:\Users\erdtM\source\repos\CursorOffice")]
    [InlineData("file:///c:/Users/erdtM/source/repos/CursorOffice", @"C:\Users\erdtM\source\repos\CursorOffice")]
    public void Normalize_ConvertsCursorUriRootsToFilesystemPaths(string source, string expected)
    {
        Assert.Equal(expected, WorkspacePathNormalizer.Normalize(source));
    }

    [Fact]
    public void Normalize_DoesNotTreatUnixRootAsAWindowsDrive()
    {
        var normalized = WorkspacePathNormalizer.Normalize("/home/erdtm/repos/CursorOffice");
        Assert.False(normalized.StartsWith(@"H:\", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("home", normalized, StringComparison.OrdinalIgnoreCase);
    }
}
