import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  shortenAddress,
} from "../data/events";

export default function Navbar({
  account,
  chainId,
  activeTab,
  onSelectTab,
  onConnectWallet,
  onSwitchNetwork,
  isConnecting,
}) {
  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div
          className="brand"
          onClick={() => onSelectTab("all")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelectTab("all")}
        >
          <span className="brand-badge">CP</span>
          <div>
            <span className="brand-title">CampusPass</span>
            <span className="brand-subtitle">Monad Testnet Doğrulama Platformu</span>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => onSelectTab("all")}
          >
            Etkinlikler
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === "student" ? "active" : ""}`}
            onClick={() => onSelectTab("student")}
          >
            Öğrenci Panelim
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === "organizer" ? "active" : ""}`}
            onClick={() => onSelectTab("organizer")}
          >
            Organizatör Paneli
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === "verify" ? "active" : ""}`}
            onClick={() => onSelectTab("verify")}
          >
            Sertifika Doğrula
          </button>
        </nav>

        <div className="wallet-controls">
          <a
            href={`${MONAD_EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="contract-pill"
            title="Sözleşmeyi Monad Explorer üzerinde görüntüle"
          >
            Sözleşme: {shortenAddress(CONTRACT_ADDRESS)} ↗
          </a>

          {account && !isCorrectNetwork && (
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={onSwitchNetwork}
            >
              Monad Testnet&apos;e Geç (10143)
            </button>
          )}

          {account && isCorrectNetwork && (
            <span className="network-pill ok">
              <span className="dot" /> Monad Testnet (10143)
            </span>
          )}

          {account ? (
            <span className="wallet-pill" title={account}>
              {shortenAddress(account)}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? "Bağlanıyor..." : "Cüzdan Bağla"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
