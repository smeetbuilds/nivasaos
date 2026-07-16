const paths = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z",
  property: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01",
  unit: "M4 4h16v16H4zM4 9h16M9 9v11",
  tenant: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  lease: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8",
  invoice: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  payment: "M2 7h20v10H2zM2 10h20M6 14h4",
  billing: "M4 3h16v18H4zM8 7h8M8 11h3M14 11h2M8 15h2M13 15h3",
  maintenance: "M14.7 6.3a4 4 0 0 0-5-5L7 4 4 1 1 1.3 5.3l9.4 9.4a2 2 0 1 0 2.8-2.8z",
  report: "M4 19V9M10 19V5M16 19v-7M22 19V2M2 22h22",
  audit: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  settings: "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 3.46-.08-.02a1.7 1.7 0 0 0-1.93.26l-.54.31a1.7 1.7 0 0 0-1.6 1.05H9.65a1.7 1.7 0 0 0-1.6-1.05l-.54-.31a1.7 1.7 0 0 0-1.93-.26l-.08.02-2-3.46.06-.06A1.7 1.7 0 0 0 3.9 15v-.62a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2-3.46.08.02a1.7 1.7 0 0 0 1.93-.26l.54-.31A1.7 1.7 0 0 0 9.65 7h4a1.7 1.7 0 0 0 1.6 1.05l.54.31a1.7 1.7 0 0 0 1.93.26l.08-.02 2 3.46-.06.06a1.7 1.7 0 0 0-.34 1.88z",
  plus: "M12 5v14M5 12h14",
  logout: "M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  building: "M4 22V2h12v20M16 8h4v14M8 6h4M8 10h4M8 14h4M8 18h4M2 22h20"
};

export default function Icon({ name, size = 20 }) {
  const d = paths[name] || paths.dashboard;
  const fillOnly = name === "dashboard";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fillOnly ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
