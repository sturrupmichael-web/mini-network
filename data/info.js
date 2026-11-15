/**
 * What things on the map are, shown in a small card when you tap or click
 * them (src/ui/inspect.js builds the card, the HUD shows it).
 *
 *   sites    One line per site type (keys from sites.js).
 *   traffic  One line per traffic type (keys from traffic.js).
 *   tiers    One line per link tier (ids from equipment.js LINK_TIERS).
 *   terrain  One line per terrain kind (keys from terrain.js).
 *   states   Extra lines added to a card when that thing is happening to
 *            the site or link you tapped.
 *   places   Things on the map that aren't sites or links.
 */
export const INFO = {
  sites: {
    datacenter:
      "Your headquarters. Office email, calls, video and backups all head here, so every site needs a path back to it.",
    office:
      "Sends email, calls, video, web and backup traffic. Busy by day, quiet at night. Link it to HQ and the internet edge.",
    warehouse:
      "Sends ERP stock updates in sudden bursts. Its ERP traffic can go to HQ or to a logistics hub.",
    retail:
      "Sends card payments. Payments must arrive within 3 hops, so keep retail branches close to HQ or a payment gateway.",
    logistics:
      "A district hub that takes ERP traffic. Warehouses gather around it. It wants a steady flow of deliveries.",
    payhub:
      "A district hub that takes card payments. Retail branches gather around it. It wants a steady flow of deliveries.",
    cloud:
      "Takes backups at night. After a cloud migration, some office traffic moves here too.",
    edge:
      "Where web traffic leaves for the internet. Once the security rules change, links to it need a firewall.",
    switch:
      "A junction you placed. It passes traffic on but never sends or receives its own. Switches forward one packet at a time, and slow down as more links meet there.",
  },

  traffic: {
    email: "Email and files, heading to HQ.",
    erp: "Stock updates from warehouses, heading to HQ or a logistics hub.",
    payments: "Card payments from retail branches. Dropped if they need more than 3 hops.",
    voip: "Phone calls, daytime only. Dropped if they need more than 3 hops.",
    video: "Video calls, daytime only. Big packets that take up a lot of a link.",
    web: "Web and SaaS traffic, daytime only, heading to the internet edge.",
    backup: "Night-time backups, heading to HQ or a cloud region. Big packets.",
    patch: "Patch Tuesday updates, sent from HQ out to every site.",
    allhands: "The exec all-hands video stream, sent from HQ to every site.",
    junk: "DDoS attack traffic. It scores nothing and clogs links. A firewall on the link filters it out.",
  },

  tiers: {
    copper: "The slowest link. Drop a bandwidth upgrade on it to move it up a tier.",
    t1: "Carries about twice what copper does.",
    fiber: "Carries nearly three times what copper does.",
    darkfiber: "The fastest tier. Carries over four times what copper does.",
  },

  terrain: {
    water: "Links can't cross water and nothing is built on it. Steer around it, or make a link a backbone to go straight over.",
    park: "Protected parkland. Links have to go around it, and no sites are built on it.",
    hills: "Too steep to dig. Links have to go around, unless you make them a backbone.",
  },

  states: {
    // Sites
    overload:
      "The ring is its overload timer. It fills while more packets wait here than it can hold. If it fills all the way, it's an outage and the game ends.",
    overloadZen: "The ring shows it's overloaded: more packets are waiting here than it can hold. In Zen mode it never causes an outage.",
    queue: "The small shapes beside it are packets waiting to be sent. Give it more links or faster ones to clear them.",
    hunger:
      "The dots above it are hunger pips. One appears every 10 seconds it goes without deliveries, and each delivery takes one away. With all 5, its overload ring starts to fill.",
    grown: "The outer ring means it has grown: bigger, busier, and able to hold more packets before it overloads.",
    canGrow: "Once {left} more of its packets are delivered, it grows into a bigger, busier site.",
    jam: "The amber glow means it's jammed: packets are queuing to get through. A core router fixes that.",
    core: "Upgraded to a core router: it forwards several times faster, however many links meet here.",
    qos: "The chevron badge is a QoS policy: calls and card payments go first here, and everything else waits a bit longer.",
    sdwan: "The badge is an SD-WAN box: when a link is cut, this site reroutes around it at once.",
    // Links
    down: "The × and dashes mean this link has been cut. It carries nothing until it's repaired{when}.",
    blocked:
      "The ! and dashes mean it's blocked: since the security rules changed, a link to the internet edge carries nothing without a firewall. Drop one on it.",
    firewall: "The little brick wall is a firewall. It lets this link reach the internet edge, and it filters out DDoS junk.",
    backbone:
      "The dashed centre line means it's a backbone: a straight, very fast link that can cross water, hills and carrier boundaries. Nothing can join it in the middle.",
    leased: "The stripe down the middle means it crosses a carrier boundary, using {n} leased line{s}.",
    selected: "Use the × to remove it (you get its squares back), or drag it to bend it or run it through another site.",
  },

  places: {
    boundary: {
      name: "Carrier boundary",
      text: "Where one carrier's area ends. A link that crosses it needs a leased line for each crossing, which comes back when you remove the link.",
    },
    closed: {
      name: "Not open yet",
      text: "This part of the map opens up as your network grows. New sites appear in the open area.",
    },
  },
};
