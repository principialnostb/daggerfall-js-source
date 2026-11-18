param([Parameter(Mandatory)] [string] $Setup, [Parameter(Mandatory)] [string] $PreviousTag)
$ErrorActionPreference = 'Stop'
# Exercise the networking code in the built .NET Framework executable with legacy process defaults.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path $Setup).Path)
$method = $assembly.GetType('TestUpdateSetup').GetMethod('ReleaseAssets', [Reflection.BindingFlags]'NonPublic,Static')
$release = $method.Invoke($null, @('https://api.github.com/repos/principialnostb/daggerfall-js-source/releases', $PreviousTag, $null))
if (!$release.ContainsKey('DFO-13.11-Setup.exe')) { throw 'The previous installation release was not found.' }
'Verified installer release lookup via TLS.'
