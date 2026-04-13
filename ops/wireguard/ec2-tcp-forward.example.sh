#!/usr/bin/env bash
set -eu

# Example: forward public TCP 33000-33049 on EC2 to the same ports on the
# internal server over WireGuard. Replies are SNATed back through EC2 so the
# internal server does not need a special return route for internet clients.

WG_IF="wg0"
INTERNAL_WG_IP="10.70.0.2"
TCP_RANGE_START="33000"
TCP_RANGE_END="33049"

sysctl -w net.ipv4.ip_forward=1

iptables -t nat -A PREROUTING -i eth0 -p tcp --dport "${TCP_RANGE_START}:${TCP_RANGE_END}" -j DNAT --to-destination "${INTERNAL_WG_IP}"
iptables -A FORWARD -i eth0 -o "${WG_IF}" -p tcp --dport "${TCP_RANGE_START}:${TCP_RANGE_END}" -d "${INTERNAL_WG_IP}" -j ACCEPT
iptables -A FORWARD -i "${WG_IF}" -o eth0 -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -A POSTROUTING -o "${WG_IF}" -p tcp --dport "${TCP_RANGE_START}:${TCP_RANGE_END}" -d "${INTERNAL_WG_IP}" -j MASQUERADE
