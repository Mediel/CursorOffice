using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace CursorOffice.Infrastructure.Cursor;

/// <summary>
/// Reads only Cursor's conversation header row (composer id and generated name).
/// Message bodies, prompts and transcript content are never queried.
/// </summary>
public sealed class CursorComposerHeaderStore
{
    private static readonly object ProviderGate = new();
    private static bool providerInitialized;
    private readonly string databasePath;

    public CursorComposerHeaderStore(string? databasePath = null)
    {
        EnsureProvider();
        this.databasePath = databasePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Cursor",
            "User",
            "globalStorage",
            "state.vscdb");
    }

    public async ValueTask<string?> TryGetTitleAsync(
        string conversationId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(conversationId);
        if (!OperatingSystem.IsWindows() || !File.Exists(databasePath))
        {
            return null;
        }

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = databasePath,
                Mode = SqliteOpenMode.ReadOnly,
                Cache = SqliteCacheMode.Shared,
                // Never keep a handle to Cursor's live state database beyond one lookup.
                Pooling = false,
            }.ToString();
            await using var connection = new SqliteConnection(connectionString);
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT value FROM composerHeaders WHERE composerId = $id LIMIT 1";
            command.Parameters.AddWithValue("$id", conversationId);
            var raw = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false) as string;
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            using var document = JsonDocument.Parse(raw);
            if (!document.RootElement.TryGetProperty("name", out var name)
                || name.ValueKind != JsonValueKind.String)
            {
                return null;
            }
            return NormalizeTitle(name.GetString());
        }
        catch (Exception exception) when (exception is SqliteException
            or JsonException
            or IOException
            or UnauthorizedAccessException)
        {
            // Cursor owns and may replace the live database. Observation is fail-open.
            return null;
        }
    }

    private static void EnsureProvider()
    {
        if (!OperatingSystem.IsWindows() || providerInitialized)
        {
            return;
        }
        lock (ProviderGate)
        {
            if (providerInitialized)
            {
                return;
            }
            SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_winsqlite3());
            SQLitePCL.raw.FreezeProvider();
            providerInitialized = true;
        }
    }

    private static string? NormalizeTitle(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }
        var normalized = string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length <= 120 ? normalized : string.Concat(normalized.AsSpan(0, 119), "…");
    }
}
