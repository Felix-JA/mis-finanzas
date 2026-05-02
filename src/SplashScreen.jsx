// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
export function SplashScreen({ mensaje }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0f0f1a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 9999,
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
    }}>
      <style>{`
        @keyframes coin1 {
          0%   { opacity:0; transform:translateY(-50px) translateX(0px); }
          60%  { opacity:1; transform:translateY(4px) translateX(0px); }
          80%  { transform:translateY(-3px) translateX(0px); }
          100% { opacity:1; transform:translateY(0px) translateX(0px); }
        }
        @keyframes coin2 {
          0%,30% { opacity:0; transform:translateY(-50px) translateX(6px); }
          75%    { opacity:1; transform:translateY(3px) translateX(6px); }
          90%    { transform:translateY(-2px) translateX(6px); }
          100%   { opacity:1; transform:translateY(0px) translateX(6px); }
        }
        @keyframes coin3 {
          0%,55% { opacity:0; transform:translateY(-50px) translateX(-5px); }
          88%    { opacity:1; transform:translateY(2px) translateX(-5px); }
          100%   { opacity:1; transform:translateY(0px) translateX(-5px); }
        }
        @keyframes glow {
          0%,100% { filter: drop-shadow(0 6px 18px #f59e0b66); }
          50%      { filter: drop-shadow(0 6px 28px #f59e0baa); }
        }
        @keyframes fadein {
          from { opacity:0; }
          to   { opacity:1; }
        }
        @keyframes dot {
          0%,100% { opacity:0.2; }
          50%      { opacity:1; }
        }
      `}</style>

      {/* Stack de monedas zigzag */}
      <svg viewBox="0 0 140 130" width="150" height="130"
        style={{ marginBottom: 20, animation: "glow 2s ease infinite" }}
        xmlns="http://www.w3.org/2000/svg">

        {/* Moneda 1 — base, centrada */}
        <g style={{ animation: "coin1 0.45s cubic-bezier(0.34,1.3,0.64,1) 0.05s both" }}>
          {/* canto */}
          <ellipse cx="70" cy="108" rx="30" ry="9" fill="#b45309"/>
          {/* cara */}
          <ellipse cx="70" cy="100" rx="30" ry="9" fill="#f59e0b"/>
          <ellipse cx="70" cy="100" rx="24" ry="6.5" fill="#fbbf24"/>
          <text x="70" y="103.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#92400e">$</text>
        </g>

        {/* Moneda 2 — encima, desplazada a la derecha */}
        <g style={{ animation: "coin2 0.45s cubic-bezier(0.34,1.3,0.64,1) 0.28s both" }}>
          <ellipse cx="76" cy="90" rx="30" ry="9" fill="#b45309"/>
          <ellipse cx="76" cy="82" rx="30" ry="9" fill="#f59e0b"/>
          <ellipse cx="76" cy="82" rx="24" ry="6.5" fill="#fbbf24"/>
          <text x="76" y="85.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#92400e">$</text>
        </g>

        {/* Moneda 3 — encima, desplazada a la izquierda */}
        <g style={{ animation: "coin3 0.45s cubic-bezier(0.34,1.3,0.64,1) 0.5s both" }}>
          <ellipse cx="65" cy="72" rx="30" ry="9" fill="#b45309"/>
          <ellipse cx="65" cy="64" rx="30" ry="9" fill="#fbbf24"/>
          <ellipse cx="65" cy="64" rx="24" ry="6.5" fill="#fde68a"/>
          <text x="65" y="67.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#92400e">$</text>
        </g>
      </svg>

      {/* Texto — aparece con la primera moneda */}
      <div style={{
        fontSize: 13, color: "#94a3b8",
        animation: "fadein 0.3s ease 0.05s both",
        marginBottom: 14,
      }}>
        {mensaje || "Cargando..."}
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: 5, animation: "fadein 0.3s ease 0.05s both" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%", background: "#6366f1",
            animation: `dot 1.2s ease ${i*0.2}s infinite`,
          }}/>
        ))}
      </div>
    </div>
  );
}