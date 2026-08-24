using CursorOffice.Core;

namespace CursorOffice.Core.Tests;

public sealed class SmokeTest
{
    [Fact]
    public void TestAssemblyLoads()
    {
        Assert.NotNull(typeof(CoreAssembly).Assembly);
    }
}
