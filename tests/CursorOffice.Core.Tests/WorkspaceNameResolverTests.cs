namespace CursorOffice.Core.Tests;

public sealed class WorkspaceNameResolverTests
{
    [Fact]
    public void Resolve_PrefersOriginRepositoryName()
    {
        var root = Directory.CreateTempSubdirectory("CursorOfficeWorkspaceName-").FullName;
        try
        {
            var git = Path.Combine(root, ".git");
            Directory.CreateDirectory(git);
            File.WriteAllText(
                Path.Combine(git, "config"),
                "[remote \"origin\"]\n  url = https://github.com/nopSolutions/nopCommerce.git\n");

            Assert.Equal("NopCommerce", WorkspaceNameResolver.Resolve(root));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Theory]
    [InlineData("nopCommerce_4.90.4_Source", "NopCommerce")]
    [InlineData("AcmePortal", "AcmePortal")]
    [InlineData("cursor-office", "cursor-office")]
    public void NormalizeDisplayName_RemovesPackagingSuffixes(string source, string expected)
    {
        Assert.Equal(expected, WorkspaceNameResolver.NormalizeDisplayName(source));
    }
}
