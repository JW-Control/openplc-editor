#ifndef OPENPLC_BAREMETAL_ETHERNET_UDP_COMPAT_H
#define OPENPLC_BAREMETAL_ETHERNET_UDP_COMPAT_H

// OpenPLC Baremetal compila este header junto al sketch, antes de resolver
// headers de librerias externas. En JWPLC Basic no debemos incluir el
// Ethernet.h generico: JWPLC_Ethernet.h ya expone EthernetUDP,
// EthernetClient y EthernetServer mediante JWPLC_W5x00_Ethernet.h.
//
// Para el resto de targets se conserva el comportamiento del
// EthernetUdp.h moderno de Arduino Ethernet, que simplemente reexporta
// Ethernet.h.
#if defined(JWPLC_BASIC)
#include <JWPLC_Ethernet.h>
#else
#include <Ethernet.h>
#endif

#endif // OPENPLC_BAREMETAL_ETHERNET_UDP_COMPAT_H
