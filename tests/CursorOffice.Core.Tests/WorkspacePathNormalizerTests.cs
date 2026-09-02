namespace CursorOffice.Core.Tests;

public sealed class WorkspacePathNormalizerTests
{
    [Theory]
    [InlineData("/c:/Users/dev/source/repos/CursorOffice", @"C:\Users\dev\source\repos\CursorOffice")]
    [InlineData("/C:/Users/dev/source/repos/CursorOffice", @"C:\Users\dev\source\repos\CursorOffice")]
    [InlineData(@"C:\Users\dev\source\repos\CursorOffice", @"C:\Users\dev\source\repos\CursorOffice")]
    [InlineData("file:///c:/Users/dev/source/repos/CursorOffice", @"C:\Users\dev\source\repos\CursorOffice")]
    public void Normalize_ConvertsCursorUriRootsToFilesystemPaths(string source, string expected)
    {
        Assert.Equal(expected, WorkspacePathNormalizer.Normalize(source));
    }

    [Fact]
    public void Normalize_DoesNotTreatUnixRootAsAWindowsDrive()
    {
        var normalized = WorkspacePathNormalizer.Normalize("/home/dev/repos/CursorOffice");
        Assert.False(normalized.StartsWith(@"H:\", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("home", normalized, StringComparison.OrdinalIgnoreCase);
    }
}
