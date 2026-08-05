# Auto Commit Script for Scriptive
# Automatically generates and pushes 5 progress updates to GitHub once a day

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location "$scriptPath\.."

# Create docs directory if it doesn't exist
if (!(Test-Path "docs")) {
    New-Item -ItemType Directory -Path "docs" | Out-Null
}

$logFile = "docs/activity_log.txt"

# List of handwriting-themed commits to simulate organic activity
$messages = @(
    "Calibrating baseline jitter thresholds",
    "Optimizing Otsu histogram bins",
    "Refining Connected Component search radius",
    "Tuning letter spacing horizontal offsets",
    "Improving parchment texture blending ratios",
    "Caching offscreen canvas color tinting maps",
    "Optimizing PDF export document quality",
    "Polishing UI glassmorphism sidebars",
    "Refining margin line auto-correction math",
    "Adjusting dynamic kerning width factors"
)

# Generate exactly 5 commits sequentially
for ($i = 0; $i -lt 5; $i++) {
    $randomMessage = $messages[(Get-Random -Minimum 0 -Maximum $messages.Length)]
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    # Append log entry
    "[ $timestamp ] $randomMessage" | Out-File -FilePath $logFile -Append -Encoding utf8

    # Execute Git commit
    git add docs/activity_log.txt
    git commit -m "docs: $randomMessage"
    
    # 2-second sleep to ensure distinct git hashes and sequential timestamps
    Start-Sleep -Seconds 2
}

# Push all 5 commits at once
git push origin main
