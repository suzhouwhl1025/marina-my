# Marina PowerShell hook (formerly EasyTerm, renamed in v1.5).
#
# Emits an OSC 1337 sequence before every prompt so the main process can
# track the session's working directory in real time
# (see software-definition.md 5.1.8, ADR-003).
#
# Design notes:
# - Source the user's own profile first so we don't pollute their config.
# - Wrap the prompt function: emit OSC 1337, then call the original prompt.
# - OSC 1337 format: ESC ] 1337 ; CurrentDir=<path> BEL
#   ([char]27 = ESC, [char]7 = BEL; works on both PowerShell 5.1 and 7).
# - Injected by WindowsAdapter.buildShellLaunchParams via:
#     pwsh -NoLogo -NoExit -Command ". 'pwsh.ps1'"
#
# IMPORTANT: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1
# files using the system ANSI code page when no BOM is present. On a
# Chinese-locale machine that is CP936/GBK, which mis-decodes UTF-8
# multi-byte sequences and can produce stray "}" / "{" tokens, breaking
# the parser. ASCII-only avoids the issue without forcing a BOM.
# Corresponding docs: software-definition.md 5.1.8, 12.5; ADR-003, ADR-008.

# Source the user's profile if it exists. -Force is intentional: even on
# error we want the hook to install (a broken profile must not silently
# disable cwd tracking).
if (Test-Path $PROFILE) {
    try {
        . $PROFILE
    } catch {
        Write-Host "[Marina] user PowerShell profile failed to load (hook still active): $_" -ForegroundColor DarkYellow
    }
}

# Wrap the prompt function. Save the original first so we can call it,
# otherwise we would recurse infinitely if the user's profile already
# defined a prompt.
$script:_marinaOriginalPrompt = $function:prompt
function prompt {
    $cwd = (Get-Location).Path
    # OSC 1337: \x1b ] 1337 ; CurrentDir=<cwd> \x07
    $osc = "$([char]27)]1337;CurrentDir=$cwd$([char]7)"
    [Console]::Write($osc)
    if ($script:_marinaOriginalPrompt) {
        & $script:_marinaOriginalPrompt
    } else {
        # Default prompt: "PS C:\path>"
        "PS $cwd> "
    }
}
