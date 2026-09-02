# Troubleshooting

## Verify the version and reload first

The most common cause of apparently stale behavior is an old extension host or C# process in one of several open Cursor windows.

```powershell
cursor.cmd --list-extensions --show-versions | Select-String cursor-office
```

After an upgrade, run `Developer: Reload Window` in every open Cursor window. Reloading only the Cursor Office tab is not enough because each window's extension host owns its local C# process.

The version in the current repository is `cursor-office.cursor-office@0.1.49`.

## The office does not open or stays empty

1. Run `View: Toggle Output` and select the `Cursor Office` channel.
2. Look for `host.ready` or a host-discovery/startup error.
3. Make sure `cursorOffice.hostPath` does not point to an old build. It should normally be empty for an installed VSIX.
4. Run `Developer: Reload Window`.
5. Run `Cursor Office: Open Office` again.

The installed Webview intentionally creates no fake demo agents when the host is empty. Seeing only the owner can therefore be correct.

## Fewer managers appear than open Cursor windows

A manager comes from an activated extension heartbeat, not from enumerating operating-system processes.

- Confirm Cursor Office is installed in the same user installation of Cursor.
- Run `Developer: Reload Window` in every window so the extension activates and begins heartbeats.
- Select the `All windows` filter.
- Wait two or three heartbeat cycles, about 4–6 seconds.
- A record with a dead extension-host PID is removed immediately; an unreadable PID still expires after the seven-second lease.

Multiple windows for one repository should produce multiple managers with short distinguishing suffixes.

## A reopened window briefly creates a duplicate manager

Current heartbeats include the extension-host PID. A dead process is removed without waiting for the full lease, and a new runtime identity for the same logical workspace can inherit the existing character, position, and reservation. Two genuinely live windows with the same workspace remain distinct.

If the duplicate persists, verify version `0.1.49` and reload every window. An older extension may still publish incomplete heartbeats or lack visual identity rebinding.

## A manager exists but its chat does not

A manager represents a window and exists without a chat. A chat appears after detected activity or relevant local metadata.

1. Install the global Hooks with `Cursor Office: Install Global Hooks`.
2. Submit a new prompt; merely opening an old chat tab is not enough.
3. Confirm the prompt was sent from the focused window with the expected workspace.
4. If several windows share the workspace and none is unambiguously focused, check `Unassigned`.
5. A chat outside the fallback lookback may remain absent until new activity occurs.

## Cursor is working but the character is idle

If Cursor is visibly working while the character is `idle`, evidence is missing from Hooks or window/workspace correlation failed.

First distinguish Hook activity from fallback:

- Hook events normally appear within hundreds of milliseconds.
- Transcript metadata shows work for three minutes after a file change.
- A subagent can remain active for up to eight minutes while its parent transcript changes.
- A long remote computation or tool call may not update a transcript. If that Cursor version also omits the matching lifecycle Hook, Cursor Office has no safe evidence that work continues.

Check:

1. Run `Cursor Office: Install Global Hooks`, then `Developer: Reload Window` in every window. Reinstalling updates managed Hook entries such as `afterFileEdit` and `preCompact`.
2. Inspect the `Cursor Office` Output channel for `host.ready` and spool errors.
3. Confirm that new small JSON files appear in `%LOCALAPPDATA%/CursorOffice/events-v3` when submitting prompts, using tools, editing files, or compacting context.
4. Inspect only normalized metadata in one event and verify `workspacePath`. Cursor 3.18 may emit `/c:/Users/...`; the bridge must normalize it to `C:\Users\...`. A value such as `C:\c:\Users\...` or an empty path prevents safe window matching.
5. Confirm that the normalized workspace matches a live heartbeat under `%LOCALAPPDATA%/CursorOffice/windows-v1`.

Do not delete `events-v3` during this test. It is a ten-minute broadcast for all concurrent hosts, and files remaining after a read are expected.

## The office is full of working agents after Cursor stopped

The activity log restores the last snapshot for every known identity. Current hosts clean stale work evidence both before `agents.snapshot` and every five seconds:

- `working` without recent evidence becomes `idle` after three minutes, or up to eight minutes for a subagent with a fresh parent;
- the demotion does not move `lastActivityAt`; and
- idle/waiting retention then removes old identities.

After upgrading, run `Developer: Reload Window` in every Cursor window. Reloading the Webview tab alone does not replace an old host. A single remaining recent chat may represent current fallback evidence rather than a historical ghost.

## A character still shows work after completion

- `afterAgentResponse`, `subagentStop`, `stop`, or a failure Hook should end work precisely.
- When a terminal Hook is missing, fallback expiry demotes `working` to `idle` after the evidence window.
- An active subagent intentionally keeps its parent chat in a coordination state.
- A queued handoff can delay visual retirement of a completed subagent.
- An unreloaded Cursor window can still run an older host; reload all windows.

## A chat or subagent does not leave

An invisible chat tab is not a reliable lifecycle event. Current approximate defaults are:

- completed subagent free time and exit after about 48–90 seconds;
- closed-window primary chat marked `offline` and retained for about 28 seconds;
- closed-window subagent retained for about 12 seconds;
- idle or `waitingForUser` main chat retained for up to 30 minutes;
- work without fresh Hook or transcript evidence demoted after three minutes;
- completed primary snapshot retained by the host for 20 minutes, although the visual worker may leave sooner;
- queued conversation, door wait, or return to a previous POI may delay departure; and
- new activity with the same identity correctly cancels departure.

If character count grows indefinitely, record names, states, kinds, and short IDs. Several real instances of one role must be distinguished from duplicate identity.

## Model is unknown

This is not automatically a bug. Cursor Office displays a model only when a Hook or another precise runtime source supplies it. A window manager has no model of its own and may only summarize team models.

The extension does not copy the currently selected UI model because one conversation, background agent, and its subagents may use different models.

## Tokens are empty or do not increase

The public Cursor Hooks contract does not guarantee billed token counters. The ledger records generation counters only when supplied by the runtime together with `generation_id`.

Therefore:

- missing tokens are not zero;
- usage is not estimated from text length;
- price is not calculated without authoritative model and price evidence;
- a manager shows workspace aggregate rather than personal generation usage;
- each generation is deduplicated and progressive values merge by maximum; and
- context-window fill from `preCompact` is separate from the token ledger.

The ledger is `%LOCALAPPDATA%/CursorOffice/usage-ledger.json`. It contains no prompt, response, or context contents. The activity log is `%LOCALAPPDATA%/CursorOffice/activity-log.ndjson`; timeline entries contain only kind, optional tool, time, and status.

## Chat names are short IDs

On Windows, titles are resolved read-only from `%APPDATA%/Cursor/User/globalStorage/state.vscdb`. Safe fallback occurs when:

- `conversation_id` has no `composerHeaders` row;
- Cursor is replacing or locking the database;
- that Cursor version does not provide the expected title schema; or
- Cursor has not generated a title yet.

Later activity retries the lookup. Messages and transcripts are not read to obtain a title.

## Characters overlap or become stuck in doors

Navigation uses a static collision map, FIFO door reservation, dynamic separation, and a route-progress watchdog. A brief wait before a door is expected; walking through furniture or permanent jitter is not.

The watchdog remains active while a character yields. When blocked, it replans with other characters represented as temporary circular obstacles. If a dense cluster offers no safe local or long detour, the system briefly releases the yielding character so separation can create space; the character must not remain paused forever.

For reproduction, record:

- room and exact doorway;
- number of characters;
- whether anyone was sitting or standing up;
- names and states of colliding characters;
- active window filter; and
- approximate time.

Changing camera angle or filter can help observation but does not change the physical state or fix the cause.

## The owner does not move with WASD

- Select the owner first; its inspector should remain open.
- Click the office canvas so it has keyboard focus.
- `WASD` uses camera-relative direction, not fixed world axes.
- `Esc` deselects the owner; the same keys then move the camera.
- A seated owner completes the stand-up transition before moving.

If the character moves while legs remain still, verify version `0.1.49` and reload every window.

## The camera is outside the office or at a bad angle

Press `Home` or `0` to restore the default position and target. Middle/right drag pans; left drag orbits.

## Old behavior remains after an update

1. Verify the installed extension version with Cursor CLI.
2. Reload every open window, not only the one showing the office.
3. Check the new host version in the `Cursor Office` Output channel.
4. If Hooks were already installed, extension activation refreshes the bridge at its stable path.
5. `events-v3` protects a new broadcast host from old destructive hosts, but an unreloaded window still renders its old extension code.

## Information to include in a bug report

- Cursor and Cursor Office versions;
- number of open Cursor windows and their workspace labels;
- office filter;
- affected character name, state, kind, and short ID;
- approximate time;
- relevant privacy-safe lines from the `Cursor Office` Output channel; and
- a screenshot with private details removed.

Do not attach prompts, responses, transcripts, credentials, private source code, or tool output unless the maintainers explicitly confirm that a narrowly scoped item is essential and provide a safe private channel.
