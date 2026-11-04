# Open the UDP ports of the udpcheck app in Windows Firewall (inbound), once
# per build; reconcile.ps1 runs this as SYSTEM.  The ports are the ones the
# app's start line names after its web port.
$ErrorActionPreference = 'Continue'
foreach ($p in 443, 9516, 3478) {
    netsh advfirewall firewall delete rule name="talmonlab-udpcheck-$p" | Out-Null
    netsh advfirewall firewall add rule name="talmonlab-udpcheck-$p" dir=in action=allow protocol=UDP localport=$p
}
'build-udpcheck: done'
