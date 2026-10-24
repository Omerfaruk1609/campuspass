import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import EventPage from "./pages/EventPage";
import StudentProfile from "./pages/StudentProfile";
import CertificateVerificationPage from "./pages/CertificateVerificationPage";
import OrganizerDashboardPage from "./pages/OrganizerDashboardPage";
import OrganizerEventAnalyticsPage from "./pages/OrganizerEventAnalyticsPage";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  getReadOnlyContract,
  getSignerContract,
  parseBlockchainError,
  switchToMonadTestnet,
} from "./data/events";
import {
  buildEventCompositeKey,
  buildMetadataAuthMessage,
  findUnmigratedLocalMetadata,
  hydrateMetadataStoreFromServerMap,
  mergeOnChainEventWithMetadata,
  saveInitialEventMetadata,
  updateEventMetadataAuthorized,
  validateEventMetadataInput,
} from "./utils/eventMetadata";
import {
  addPendingMetadataSync,
  cancelEventOnBackend,
  clearActiveAuthState,
  ensureOrganizerSiweSession,
  fetchEventsMetadataFromBackend,
  logoutOrganizerSiweSession,
  reactivateEventOnBackend,
  readPendingSyncQueue,
  removePendingMetadataSync,
  saveMetadataToBackend,
} from "./utils/apiClient";
import "./App.css";

function parseVerifyCertificateIdFromUrl() {
  if (typeof window === "undefined" || !window.location?.pathname) {
    return null;
  }
  const match = window.location.pathname.match(/^\/verify(?:\/([^/?#]+))?\/?$/i);
  if (!match) return null;
  return match[1] ? decodeURIComponent(match[1]).trim().toUpperCase() : "";
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [backendStatus, setBackendStatus] = useState({
    checking: true,
    online: false,
    mode: "checking",
    error: null,
  });
  const [pendingSyncItems, setPendingSyncItems] = useState([]);
  const [syncingPending, setSyncingPending] = useState(false);

  const [activeTab, setActiveTab] = useState(() =>
    parseVerifyCertificateIdFromUrl() !== null ? "verify" : "all"
  );
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [organizerAnalyticsEventId, setOrganizerAnalyticsEventId] = useState(null);
  const [verifyCertificateId, setVerifyCertificateId] = useState(
    () => parseVerifyCertificateIdFromUrl() || ""
  );

  const [txState, setTxState] = useState({
    busy: false,
    type: null,
    targetId: null,
  });

  const [banner, setBanner] = useState(null);

  const computePendingItemsForAccount = useCallback(
    (currentAccount, serverMetadataMap = {}) => {
      if (!currentAccount) {
        setPendingSyncItems([]);
        return;
      }

      const pendingQueue = readPendingSyncQueue();
      const queueList = Object.values(pendingQueue).filter(
        (item) =>
          item &&
          String(item.organizerAddress || "").toLowerCase() ===
            currentAccount.toLowerCase()
      );

      const unmigratedList = findUnmigratedLocalMetadata(
        currentAccount,
        serverMetadataMap
      ).map((rec) => ({
        compositeKey: rec.compositeKey,
        chainId: rec.chainId,
        contractAddress: rec.contractAddress,
        eventId: rec.eventId,
        organizerAddress: rec.organizer || currentAccount,
        metadataInput: rec,
        reason: "Yerel tarayıcı (localStorage) kaydı — sunucuya aktarılabilir.",
      }));

      const mergedByKey = new Map();
      for (const item of [...unmigratedList, ...queueList]) {
        if (item && item.compositeKey) {
          mergedByKey.set(item.compositeKey, item);
        }
      }
      setPendingSyncItems(Array.from(mergedByKey.values()));
    },
    []
  );

  const loadEvents = useCallback(
    async (currentAccount) => {
      setLoadingEvents(true);
      try {
        let serverMetadataMap = {};
        const apiAttendanceCountMap = {};

        try {
          const backendData = await fetchEventsMetadataFromBackend();
          serverMetadataMap = backendData.metadataMap || {};
          hydrateMetadataStoreFromServerMap(serverMetadataMap);

          for (const item of backendData.items || []) {
            if (item && item.id && typeof item.verifiedAttendanceCount === "number") {
              apiAttendanceCountMap[Number(item.id)] = item.verifiedAttendanceCount;
            }
          }

          setBackendStatus({
            checking: false,
            online: true,
            mode: "online",
            error: null,
          });
        } catch (apiErr) {
          setBackendStatus({
            checking: false,
            online: false,
            mode: "offline-fallback",
            error: apiErr.message || "Backend API sunucusuna ulaşılamadı.",
          });
        }

        computePendingItemsForAccount(currentAccount, serverMetadataMap);

        const contract = getReadOnlyContract();
        const nextIdBigInt = await contract.nextEventId();
        const total = Number(nextIdBigInt) - 1;

        if (total <= 0) {
          setEvents([]);
          return;
        }

        // Blokzincir üzerindeki AttendanceMarked olaylarından doğrulanmış katılımcı sayılarını oku
        const attendanceCountMap = { ...apiAttendanceCountMap };
        try {
          const filter = contract.filters.AttendanceMarked();
          const logs = await contract.queryFilter(filter, -50000);
          const uniquePerEvent = {};
          for (const log of logs) {
            const evId = Number(log.args?.eventId);
            const part = String(log.args?.participant || "").toLowerCase();
            if (evId && part) {
              if (!uniquePerEvent[evId]) uniquePerEvent[evId] = new Set();
              uniquePerEvent[evId].add(part);
            }
          }
          for (const [evId, setObj] of Object.entries(uniquePerEvent)) {
            attendanceCountMap[evId] = Math.max(
              attendanceCountMap[evId] || 0,
              setObj.size
            );
          }
        } catch {
          // RPC log aralığı kısıtlıysa güvenli şekilde devam et
        }

        const ids = Array.from({ length: total }, (_, idx) => idx + 1);
        const loaded = await Promise.all(
          ids.map(async (id) => {
            const ev = await contract.events(id);
            let isRegistered = false;
            let isAttended = false;

            if (currentAccount) {
              const [reg, att] = await Promise.all([
                contract.registered(id, currentAccount),
                contract.attended(id, currentAccount),
              ]);
              isRegistered = Boolean(reg);
              isAttended = Boolean(att);
            }

            const verifiedCount = Math.max(
              attendanceCountMap[id] || 0,
              isAttended ? 1 : 0
            );

            const baseOnChainEvent = {
              id: Number(ev.id),
              organizer: ev.organizer,
              title: ev.title,
              capacity: Number(ev.capacity),
              registeredCount: Number(ev.registeredCount),
              active: Boolean(ev.active),
              isRegistered,
              isAttended,
              verifiedAttendanceCount: verifiedCount,
            };

            return mergeOnChainEventWithMetadata(baseOnChainEvent, {
              chainId: MONAD_CHAIN_ID,
              contractAddress: CONTRACT_ADDRESS,
            });
          })
        );

        // En yeni etkinlikler üstte
        setEvents(loaded.reverse());
      } catch (error) {
        setBanner({
          type: "error",
          message:
            "Etkinlikler blokzincirden okunurken hata oluştu: " +
            parseBlockchainError(error),
        });
      } finally {
        setLoadingEvents(false);
      }
    },
    [computePendingItemsForAccount]
  );

  // İlk yüklemede mevcut cüzdan oturumunu ve etkinlikleri kontrol et
  useEffect(() => {
    async function init() {
      let currentAccount = null;

      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.send("eth_accounts", []);
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
          if (accounts.length > 0) {
            currentAccount = ethers.getAddress(accounts[0]);
            setAccount(currentAccount);
          }
        } catch {
          // Cüzdan okuma hatası olursa salt-okunur modda devam et
        }
      }

      await loadEvents(currentAccount);
    }

    init();
  }, [loadEvents]);

  // Cüzdan hesap ve ağ değişimlerini dinle
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      const nextAcc =
        accounts && accounts.length > 0 ? ethers.getAddress(accounts[0]) : null;
      // Cüzdan değiştiğinde önceki cüzdanın SIWE oturumunu temizle
      clearActiveAuthState();
      logoutOrganizerSiweSession().catch(() => {});
      setAccount(nextAcc);
      loadEvents(nextAcc);
    };

    const handleChainChanged = (hexChainId) => {
      const parsed = Number.parseInt(hexChainId, 16);
      setChainId(parsed);
      loadEvents(account);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [account, loadEvents]);

  async function handleConnectWallet() {
    setBanner(null);
    if (!window.ethereum) {
      setBanner({
        type: "error",
        message:
          "Tarayıcınızda MetaMask veya EVM uyumlu bir cüzdan eklentisi bulunamadı.",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      const connectedChainId = Number(network.chainId);
      setChainId(connectedChainId);

      if (accounts.length > 0) {
        const checksummed = ethers.getAddress(accounts[0]);
        setAccount(checksummed);

        if (connectedChainId !== MONAD_CHAIN_ID) {
          try {
            await switchToMonadTestnet();
            const updatedProvider = new ethers.BrowserProvider(window.ethereum);
            const updatedNetwork = await updatedProvider.getNetwork();
            setChainId(Number(updatedNetwork.chainId));
          } catch {
            setBanner({
              type: "warning",
              message:
                "Cüzdan bağlandı ancak ağınız Monad Testnet (10143) değil. Lütfen üst menüden ağı değiştirin.",
            });
          }
        }

        await loadEvents(checksummed);
      }
    } catch (error) {
      setBanner({
        type: "error",
        message: parseBlockchainError(error),
      });
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSwitchNetwork() {
    setBanner(null);
    try {
      await switchToMonadTestnet();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      setBanner({
        type: "success",
        message: "Monad Testnet (10143) ağına başarıyla geçildi.",
      });
    } catch (error) {
      setBanner({
        type: "error",
        message: "Ağ değiştirilemedi: " + parseBlockchainError(error),
      });
    }
  }

  // Faz 9 — Yerel (localStorage) veya Bekleyen Metadata Kayıtlarını Backend API'ye Aktarma (Migration & Retry)
  async function handleSyncPendingMetadataToApi() {
    if (!account || pendingSyncItems.length === 0) return;
    setSyncingPending(true);
    setBanner({
      type: "info",
      message:
        "Yerel metadata kayıtlarını sunucuya aktarmak için SIWE (EIP-4361) cüzdan oturumu doğrulanıyor...",
    });

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      await ensureOrganizerSiweSession({
        signer,
        walletAddress: account,
        chainId: MONAD_CHAIN_ID,
      });

      let successCount = 0;
      for (const item of pendingSyncItems) {
        const saved = await saveMetadataToBackend({
          eventId: item.eventId,
          metadataInput: item.metadataInput,
          method: "POST",
        });
        if (saved) {
          hydrateMetadataStoreFromServerMap({ [saved.compositeKey]: saved });
          removePendingMetadataSync(item.compositeKey);
          successCount += 1;
        }
      }

      await loadEvents(account);
      setBanner({
        type: "success",
        message: `${successCount} adet etkinlik metadata kaydı PostgreSQL Backend API'ye başarıyla senkronize edildi!`,
      });
    } catch (err) {
      setBanner({
        type: "error",
        message:
          "Metadata senkronizasyonu tamamlanamadı (yerel verileriniz korundu): " +
          parseBlockchainError(err),
      });
    } finally {
      setSyncingPending(false);
    }
  }

  // Algoritma 5.A + Faz 7 & Faz 9 — Gelişmiş Etkinlik Oluşturma (Önce Zincir Üstü Onay, Sonra Backend API + Yerel Kayıt)
  async function handleCreateEvent(formInput) {
    let validated;
    try {
      validated = validateEventMetadataInput(formInput, {
        requireTitleAndCapacity: true,
      });
    } catch (validationError) {
      setBanner({
        type: "error",
        message: validationError.message,
      });
      return null;
    }

    setBanner({
      type: "info",
      message: "Etkinlik oluşturma işlemi için cüzdanınızdan onay bekleniyor...",
    });
    setTxState({ busy: true, type: "create", targetId: null });

    try {
      const contract = await getSignerContract();
      const tx = await contract.createEvent(
        validated.title,
        BigInt(validated.capacity)
      );

      setBanner({
        type: "info",
        message: "İşlem ağa gönderildi, Monad Testnet onayı bekleniyor...",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();

      // EventCreated olayını (log) oku
      let createdEventId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === "EventCreated") {
            createdEventId = Number(parsed.args.eventId);
            break;
          }
        } catch {
          // Başka log ise atla
        }
      }

      if (!createdEventId) {
        const readContract = getReadOnlyContract();
        const nextId = Number(await readContract.nextEventId());
        if (nextId > 1) createdEventId = nextId - 1;
      }

      let apiSaveError = null;

      // Yalnızca blokzincir işlemi onaylandıktan sonra metadata'yı kaydet
      if (createdEventId && account) {
        // 1. Veri kaybını önlemek için önce yerel önbelleğe yaz
        saveInitialEventMetadata({
          chainId: MONAD_CHAIN_ID,
          contractAddress: CONTRACT_ADDRESS,
          eventId: createdEventId,
          onChainOrganizer: account,
          callerAddress: account,
          metadataInput: validated,
        });

        // 2. Backend API'ye SIWE oturumuyla kaydetmeyi dene
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();

          await ensureOrganizerSiweSession({
            signer,
            walletAddress: account,
            chainId: MONAD_CHAIN_ID,
          });

          const savedServerRecord = await saveMetadataToBackend({
            eventId: createdEventId,
            metadataInput: validated,
            method: "POST",
          });

          if (savedServerRecord) {
            hydrateMetadataStoreFromServerMap({
              [savedServerRecord.compositeKey]: savedServerRecord,
            });
            removePendingMetadataSync(savedServerRecord.compositeKey);
          }
        } catch (apiErr) {
          apiSaveError = apiErr.message || "Backend API erişilemedi.";
          addPendingMetadataSync({
            chainId: MONAD_CHAIN_ID,
            contractAddress: CONTRACT_ADDRESS,
            eventId: createdEventId,
            organizerAddress: account,
            metadataInput: validated,
            reason: apiSaveError,
          });
        }
      }

      await loadEvents(account);

      if (apiSaveError) {
        setBanner({
          type: "warning",
          message: `"${validated.title}" (Etkinlik #${createdEventId}) blokzincirde onaylandı ancak Backend API kaydı başarısız oldu (${apiSaveError}). Metadata yerel olarak korundu; üstteki senkronizasyon çubuğundan yeniden deneyebilirsiniz.`,
          txHash: receipt.hash,
        });
      } else {
        setBanner({
          type: "success",
          message: createdEventId
            ? `"${validated.title}" etkinliği blokzincirde oluşturuldu ve tüm detayları sunucuya kaydedildi! (Etkinlik #${createdEventId})`
            : `"${validated.title}" etkinliği başarıyla oluşturuldu!`,
          txHash: receipt.hash,
        });
      }

      return createdEventId || true;
    } catch (error) {
      setBanner({
        type: "error",
        message: parseBlockchainError(error),
      });
      return null;
    } finally {
      setTxState({ busy: false, type: null, targetId: null });
    }
  }

  // Faz 7 & Faz 9 — SIWE Oturumu + Kriptografik Organizatör İmzası ile Metadata Güncelleme / İptal Etme
  async function handleUpdateEventMetadata(
    eventId,
    metadataInput,
    actionType = "UPDATE_METADATA"
  ) {
    if (!account) {
      setBanner({
        type: "error",
        message: "Yönetim işlemi için önce cüzdanınızı bağlamalısınız.",
      });
      return false;
    }

    setTxState({ busy: true, type: "metadata", targetId: eventId });
    try {
      const validated = validateEventMetadataInput(metadataInput, {
        requireTitleAndCapacity: false,
      });

      const readContract = getReadOnlyContract();
      const onChainEv = await readContract.events(eventId);
      if (Number(onChainEv.id) === 0) {
        throw new Error("Etkinlik blokzincirde bulunamadı.");
      }

      const onChainOrganizer = onChainEv.organizer;
      if (onChainOrganizer.toLowerCase() !== account.toLowerCase()) {
        throw new Error(
          "Yetkisiz işlem: Yalnızca blokzincir üzerindeki etkinlik organizatörü değişiklik yapabilir."
        );
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Backend çevrimiçiyse SIWE oturumuyla doğrudan API endpoint'lerini çağır
      if (backendStatus.online) {
        setBanner({
          type: "info",
          message:
            "Organizatör SIWE oturumu doğrulanıyor ve değişiklikler sunucuya kaydediliyor...",
        });

        await ensureOrganizerSiweSession({
          signer,
          walletAddress: account,
          chainId: MONAD_CHAIN_ID,
        });

        let serverSaved = null;
        if (actionType === "CANCEL_EVENT") {
          serverSaved = await cancelEventOnBackend({
            eventId,
            cancelReason: validated.cancelReason || "",
          });
        } else if (actionType === "RESTORE_EVENT") {
          serverSaved = await reactivateEventOnBackend({ eventId });
        } else {
          serverSaved = await saveMetadataToBackend({
            eventId,
            metadataInput: validated,
            method: "PATCH",
          });
        }

        if (serverSaved) {
          hydrateMetadataStoreFromServerMap({
            [serverSaved.compositeKey]: serverSaved,
          });
          removePendingMetadataSync(
            buildEventCompositeKey(MONAD_CHAIN_ID, CONTRACT_ADDRESS, eventId)
          );
        }
      } else {
        // Backend çevrimdışıysa EIP-191 imzalı yerel güncelleme yap ve senkronizasyon kuyruğuna ekle
        const signedTimestamp = Math.floor(Date.now() / 1000);
        const authMessage = buildMetadataAuthMessage({
          action: actionType,
          chainId: MONAD_CHAIN_ID,
          contractAddress: CONTRACT_ADDRESS,
          eventId,
          organizer: onChainOrganizer,
          timestamp: signedTimestamp,
        });

        setBanner({
          type: "info",
          message:
            "Organizatör yetkinizi doğrulamak için lütfen cüzdanınızda mesaj imzasını onaylayın...",
        });

        const signature = await signer.signMessage(authMessage);

        updateEventMetadataAuthorized({
          chainId: MONAD_CHAIN_ID,
          contractAddress: CONTRACT_ADDRESS,
          eventId,
          onChainOrganizer,
          callerAddress: account,
          signature,
          signedTimestamp,
          action: actionType,
          metadataInput: validated,
        });

        addPendingMetadataSync({
          chainId: MONAD_CHAIN_ID,
          contractAddress: CONTRACT_ADDRESS,
          eventId,
          organizerAddress: account,
          metadataInput: validated,
          reason: "Çevrimdışı modda güncellendi — API çevrimiçi olduğunda senkronize edilebilir.",
        });
      }

      await loadEvents(account);

      setBanner({
        type: "success",
        message:
          actionType === "CANCEL_EVENT"
            ? `Etkinlik #${eventId} iptal durumu güncellendi.`
            : actionType === "RESTORE_EVENT"
            ? `Etkinlik #${eventId} yeniden aktifleştirildi.`
            : `Etkinlik #${eventId} bilgileri başarıyla güncellendi.`,
      });
      return true;
    } catch (error) {
      setBanner({
        type: "error",
        message: parseBlockchainError(error),
      });
      return false;
    } finally {
      setTxState({ busy: false, type: null, targetId: null });
    }
  }

  // Algoritma 5.B — Etkinliğe Kayıt Olma
  async function handleRegisterEvent(eventId) {
    if (!account) {
      setBanner({
        type: "error",
        message: "Etkinliğe kayıt olmak için önce cüzdanınızı bağlamalısınız.",
      });
      return false;
    }

    const targetEvent = events.find((e) => e.id === Number(eventId));
    if (targetEvent && !targetEvent.canRegisterByTime) {
      setBanner({
        type: "error",
        message:
          targetEvent.registrationBlockReason ||
          "Bu etkinlik için kayıt süresi sona ermiş veya etkinlik iptal edilmiş.",
      });
      return false;
    }

    setBanner({
      type: "info",
      message: `Etkinlik #${eventId} kaydı için cüzdanınızdan işlem onayı bekleniyor...`,
    });
    setTxState({ busy: true, type: "register", targetId: eventId });

    try {
      const contract = await getSignerContract();
      const tx = await contract.registerForEvent(BigInt(eventId));

      setBanner({
        type: "info",
        message: "Kayıt işlemi gönderildi, blokzincir onayı bekleniyor...",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();
      await loadEvents(account);

      setBanner({
        type: "success",
        message: `Kaydınız tamamlandı! (Etkinlik #${eventId})`,
        txHash: receipt.hash,
      });
      return true;
    } catch (error) {
      setBanner({
        type: "error",
        message: parseBlockchainError(error),
      });
      return false;
    } finally {
      setTxState({ busy: false, type: null, targetId: null });
    }
  }

  // Organizatör Katılım İşaretleme (markAttendance)
  async function handleMarkAttendance(eventId, participantAddress) {
    setBanner({
      type: "info",
      message: "Katılım doğrulama işlemi için cüzdanınızdan onay bekleniyor...",
    });
    setTxState({ busy: true, type: "attendance", targetId: eventId });

    try {
      const contract = await getSignerContract();
      const tx = await contract.markAttendance(
        BigInt(eventId),
        participantAddress
      );

      setBanner({
        type: "info",
        message: "Katılım doğrulaması blokzincire işleniyor...",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();
      await loadEvents(account);

      setBanner({
        type: "success",
        message: `Katılımcı (${participantAddress}) için katılım başarıyla doğrulandı!`,
        txHash: receipt.hash,
      });
      return true;
    } catch (error) {
      setBanner({
        type: "error",
        message: parseBlockchainError(error),
      });
      return false;
    } finally {
      setTxState({ busy: false, type: null, targetId: null });
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const parsedId = parseVerifyCertificateIdFromUrl();
      if (parsedId !== null) {
        setVerifyCertificateId(parsedId);
        setSelectedEventId(null);
        setActiveTab("verify");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleOpenVerifyPage(certificateId = "") {
    const cleanId = String(certificateId || "").trim().toUpperCase();
    setVerifyCertificateId(cleanId);
    setSelectedEventId(null);
    setActiveTab("verify");
    if (typeof window !== "undefined" && window.history?.pushState) {
      const nextUrl = cleanId ? `/verify/${encodeURIComponent(cleanId)}` : "/verify";
      window.history.pushState({}, "", nextUrl);
    }
  }

  return (
    <div className="app-shell">
      <Navbar
        account={account}
        chainId={chainId}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSelectedEventId(null);
          setOrganizerAnalyticsEventId(null);
          if (typeof window !== "undefined" && window.history?.pushState) {
            if (tab === "verify") {
              const nextUrl = verifyCertificateId
                ? `/verify/${encodeURIComponent(verifyCertificateId)}`
                : "/verify";
              window.history.pushState({}, "", nextUrl);
            } else if (window.location.pathname.startsWith("/verify")) {
              window.history.pushState({}, "", "/");
            }
          }
        }}
        onConnectWallet={handleConnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
        isConnecting={isConnecting}
      />

      {/* Faz 9 — Backend API Durumu ve Yerel Veri Kurtarma / Senkronizasyon Çubuğu */}
      {!backendStatus.checking && (!backendStatus.online || pendingSyncItems.length > 0) && (
        <div className="global-banner info" style={{ borderLeftColor: "#8b5cf6" }}>
          <div className="banner-content">
            {!backendStatus.online ? (
              <span>
                <strong>Çevrimdışı Yedek Mod:</strong> Backend API sunucusuna şu anda
                ulaşılamıyor. Blokzincir işlemleri (etkinlik oluşturma, kayıt, imzalı QR
                doğrulama, öğrenci profili) ve yerel önbellek kesintisiz çalışmaya devam
                eder.
              </span>
            ) : (
              <span>
                <strong>Bekleyen Metadata Senkronizasyonu ({pendingSyncItems.length} Etkinlik):</strong>{" "}
                Yerel tarayıcıda oluşturduğunuz etkinlik detaylarını tüm cihazlarda görünür
                kılmak için Backend API&apos;ye aktarabilirsiniz.
              </span>
            )}
          </div>
          {backendStatus.online && pendingSyncItems.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSyncPendingMetadataToApi}
              disabled={syncingPending}
            >
              {syncingPending
                ? "Senkronize Ediliyor..."
                : "↻ API'ye Senkronize Et (SIWE)"}
            </button>
          )}
        </div>
      )}

      {banner && (
        <div className={`global-banner ${banner.type}`}>
          <div className="banner-content">
            <span>{banner.message}</span>
            {banner.txHash && (
              <a
                href={`${MONAD_EXPLORER_URL}/tx/${banner.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="banner-link"
              >
                İşlemi Explorer&apos;da Gör ↗
              </a>
            )}
          </div>
          <button
            type="button"
            className="banner-close"
            onClick={() => setBanner(null)}
            aria-label="Bildirimi kapat"
          >
            ✕
          </button>
        </div>
      )}

      <main className="main-content">
        {selectedEventId !== null ? (
          <EventPage
            key={`${selectedEventId}-${account || "guest"}`}
            event={selectedEvent}
            account={account}
            chainId={chainId}
            onBack={() => setSelectedEventId(null)}
            onRegisterEvent={handleRegisterEvent}
            onMarkAttendance={handleMarkAttendance}
            onUpdateMetadata={handleUpdateEventMetadata}
            txState={txState}
          />
        ) : organizerAnalyticsEventId !== null ? (
          <OrganizerEventAnalyticsPage
            key={`analytics-${organizerAnalyticsEventId}-${account || "guest"}`}
            eventId={organizerAnalyticsEventId}
            account={account}
            chainId={chainId}
            onBack={() => setOrganizerAnalyticsEventId(null)}
            onOpenEventPage={(id) => {
              setOrganizerAnalyticsEventId(null);
              setSelectedEventId(id);
            }}
          />
        ) : activeTab === "verify" ? (
          <CertificateVerificationPage
            key={`verify-${verifyCertificateId || "empty"}`}
            initialCertificateId={verifyCertificateId}
            onBackToEvents={() => {
              setActiveTab("all");
              if (typeof window !== "undefined" && window.history?.pushState) {
                window.history.pushState({}, "", "/");
              }
            }}
          />
        ) : activeTab === "student" ? (
          <StudentProfile
            key={`profile-${account || "guest"}-${chainId || "none"}`}
            account={account}
            chainId={chainId}
            onConnectWallet={handleConnectWallet}
            onSwitchNetwork={handleSwitchNetwork}
            onSelectEvent={(id) => setSelectedEventId(id)}
            onExploreEvents={() => setActiveTab("all")}
            onOpenVerifyPage={handleOpenVerifyPage}
            isConnecting={isConnecting}
          />
        ) : activeTab === "organizer" ? (
          <OrganizerDashboardPage
            key={`organizer-${account || "guest"}-${chainId || "none"}`}
            account={account}
            chainId={chainId}
            onConnectWallet={handleConnectWallet}
            onSelectEvent={(id) => setSelectedEventId(id)}
            onSelectEventAnalytics={(id) => setOrganizerAnalyticsEventId(id)}
            onCreateEventClick={() => {
              setActiveTab("all");
            }}
            isConnecting={isConnecting}
          />
        ) : (
          <HomePage
            events={events}
            loadingEvents={loadingEvents}
            account={account}
            chainId={chainId}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onSelectEvent={(id) => setSelectedEventId(id)}
            onCreateEvent={handleCreateEvent}
            onRegisterEvent={handleRegisterEvent}
            onRefreshEvents={() => loadEvents(account)}
            txState={txState}
          />
        )}
      </main>

      <Footer
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSelectedEventId(null);
          setOrganizerAnalyticsEventId(null);
          if (typeof window !== "undefined" && window.history?.pushState) {
            if (tab === "verify") {
              const nextUrl = verifyCertificateId
                ? `/verify/${encodeURIComponent(verifyCertificateId)}`
                : "/verify";
              window.history.pushState({}, "", nextUrl);
            } else if (window.location.pathname.startsWith("/verify")) {
              window.history.pushState({}, "", "/");
            }
          }
        }}
      />
    </div>
  );
}
