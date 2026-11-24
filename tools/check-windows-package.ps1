$ErrorActionPreference = 'Stop'
$releaseDir = Join-Path $PSScriptRoot '../release'
$archive = (Resolve-Path -LiteralPath (Join-Path $releaseDir 'Chembench-Studio-Windows.zip')).Path
$expected = (Get-FileHash -LiteralPath (Join-Path $releaseDir 'Chembench-Studio.html') -Algorithm SHA256).Hash
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('chembench-check-' + [Guid]::NewGuid().ToString('N'))
try {
    $memory = [IO.MemoryStream]::new()
    $stream = $zip.GetEntry('Chembench Studio.exe').Open()
    try { $stream.CopyTo($memory) } finally { $stream.Dispose() }
    $assembly = [Reflection.Assembly]::Load($memory.ToArray())
    $memory.Dispose()
    $loader = $assembly.GetType('Launcher').GetMethod('Materialize', [Reflection.BindingFlags]'Static,NonPublic')
    $target = $loader.Invoke($null, [object[]]@($scratch.PSObject.BaseObject))
    if ((Get-FileHash -LiteralPath $target).Hash -ne $expected) { throw 'Windows startup extracted a different UI.' }
    $timestamp = [IO.File]::GetLastWriteTimeUtc($target)
    $null = $loader.Invoke($null, [object[]]@($scratch.PSObject.BaseObject))
    if ([IO.File]::GetLastWriteTimeUtc($target) -ne $timestamp) { throw 'Unchanged UI was overwritten.' }
    [IO.File]::WriteAllText($target, 'Old release')
    $null = $loader.Invoke($null, [object[]]@($scratch.PSObject.BaseObject))
    if ((Get-FileHash -LiteralPath $target).Hash -ne $expected) { throw 'Windows update did not replace old UI.' }
    Write-Output "Windows package verified for first launch, relaunch, and update. SHA-256 $expected"
} finally {
    $zip.Dispose()
    $testFile = Join-Path $scratch 'Studio.html'
    if (Test-Path -LiteralPath $testFile) { Remove-Item -LiteralPath $testFile }
    if (Test-Path -LiteralPath $scratch) { [IO.Directory]::Delete($scratch, $false) }
}
