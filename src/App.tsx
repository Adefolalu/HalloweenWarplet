import { sdk } from "@farcaster/frame-sdk";
import { sdk as miniAppSdk } from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { MutationComponent } from "./components/MutationComponent";
import type { NFTData } from "./hooks/useMutation";
import { useFarcasterContext } from "./hooks/useFarcasterContext";
import { fetchUserWarplets, type WarpletNFT } from "./services/warpletService";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/hero.jpg)" }}
      >
        <div className="absolute inset-0 backdrop-blur-md bg-purple-900/60"></div>
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/70 via-indigo-900/60 to-black/80"></div>

      {/* Floating Halloween Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <div
          className="absolute top-20 left-10 text-2xl animate-bounce"
          style={{ animationDelay: "0s" }}
        >
          🦇
        </div>
        <div
          className="absolute top-32 right-16 text-xl animate-bounce"
          style={{ animationDelay: "1s" }}
        >
          👻
        </div>
        <div
          className="absolute top-64 left-20 text-lg animate-bounce"
          style={{ animationDelay: "2s" }}
        >
          🕷️
        </div>
        <div
          className="absolute bottom-32 right-8 text-2xl animate-bounce"
          style={{ animationDelay: "0.5s" }}
        >
          🎃
        </div>
        <div
          className="absolute bottom-48 left-12 text-lg animate-bounce"
          style={{ animationDelay: "1.5s" }}
        >
          🍭
        </div>
      </div>

      {/* Mystical Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-orange-900/20 via-transparent to-purple-900/20"></div>

      <div className="container mx-auto py-8 px-4 max-w-md relative z-20">
        <header className="text-center mb-8 relative">
          {/* Magical Border */}
          <div className="absolute -inset-4 bg-gradient-to-r from-orange-400/20 via-purple-400/20 to-orange-400/20 rounded-3xl blur-xl"></div>

          <div className="relative bg-gradient-to-br from-black/60 via-purple-900/40 to-orange-900/60 backdrop-blur-sm rounded-2xl p-6 border-2 border-orange-400/30 shadow-[0_0_30px_rgba(251,146,60,0.3)]">
            <h1 className="text-3xl font-creepster font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-500 mb-3 tracking-wide filter drop-shadow-[0_0_15px_rgba(251,146,60,0.8)]">
              🎃 Halloween Warplets 🎃
            </h1>
          </div>
        </header>

        <AdminPanel />
        <WarpletMutator />
      </div>
    </div>
  );
}

function WarpletMutator() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const farcasterContext = useFarcasterContext();
  const [warpletData, setWarpletData] = useState<NFTData | null>(null);

  const [error] = useState<string | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(false);
  // null = detecting, true/false = resolved
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  // Owned Warplets (by connected wallet)
  const [ownedWarplets, setOwnedWarplets] = useState<WarpletNFT[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedError, setOwnedError] = useState<string | null>(null);

  // Check if running in Mini App
  useEffect(() => {
    async function checkMiniApp() {
      // Use a small timeout to allow context comms and avoid flicker
      let isInMiniApp = false;
      try {
        // Some SDKs accept a timeout arg; if unsupported, this will be ignored
        isInMiniApp = (await sdk.isInMiniApp()) ?? false;
      } catch {
        isInMiniApp = false;
      }
      setIsMiniApp(isInMiniApp);
    }
    checkMiniApp();
  }, []);

  // Mini app lifecycle hooks: mark ready and suggest adding mini app
  useEffect(() => {
    async function onMiniAppReady() {
      if (!isMiniApp) return;
      try {
        sdk.actions.ready();
      } catch (e) {
        console.debug("Mini app ready failed:", e);
      }
      try {
        await miniAppSdk.actions.addMiniApp();
      } catch (e) {
        // Non-fatal if user dismisses or not supported
        console.debug("Add mini app skipped:", e);
      }
    }
    onMiniAppReady();
  }, [isMiniApp]);

  // Auto-connect Farcaster wallet if in miniapp
  useEffect(() => {
    async function autoConnectFarcaster() {
      if (isMiniApp === true && !isConnected && !autoConnecting) {
        setAutoConnecting(true);
        try {
          // Retry a few times in case connector registry isn't ready yet
          for (let attempt = 0; attempt < 3 && !isConnected; attempt++) {
            const farcasterConnector = connectors.find(
              (connector) => connector.id === "farcasterFrame"
            );
            if (farcasterConnector) {
              console.log(
                "Auto-connecting Farcaster wallet in Mini App... (attempt",
                attempt + 1,
                ")"
              );
              try {
                await connect({ connector: farcasterConnector });
                break;
              } catch (e) {
                // transient error, retry shortly
                await new Promise((r) => setTimeout(r, 400));
              }
            } else {
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        } catch (error) {
          console.error("Auto-connect failed:", error);
        } finally {
          setAutoConnecting(false);
        }
      }
    }

    autoConnectFarcaster();
  }, [isMiniApp, isConnected, autoConnecting, connectors, connect]);

  // Fetch Warplets owned by connected wallet (works for primary/secondary owners)
  useEffect(() => {
    async function loadOwnedWarplets() {
      if (!isConnected || !address) return;
      setOwnedLoading(true);
      setOwnedError(null);
      try {
        const nfts = await fetchUserWarplets(address);
        setOwnedWarplets(nfts);
        // Auto-select if exactly one
        if (nfts.length === 1) {
          const w = nfts[0];
          setWarpletData({
            tokenId: w.tokenId,
            contractAddress: "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
            name: w.name || `Warplet #${w.tokenId}`,
            description: w.description || "",
            image: w.image,
            attributes: w.attributes || [],
          });
        }
      } catch (e) {
        console.error("Failed to fetch owned Warplets:", e);
        setOwnedError("Unable to load your Warplets. Please try again.");
      } finally {
        setOwnedLoading(false);
      }
    }
    loadOwnedWarplets();
  }, [isConnected, address]);

  // Show loading state (context or owned warplets)
  if (farcasterContext.isLoading || ownedLoading) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-12 text-center border-2 border-orange-400/40 relative overflow-hidden">
          {/* Spooky Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-purple-500/10 to-orange-500/10 animate-pulse"></div>

          <div className="relative z-10">
            {/* Halloween Loading Animation */}
            <div className="relative inline-block mb-6">
              <div className="w-16 h-16 text-4xl animate-spin">🎃</div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-orange-400/30 rounded-full"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
            </div>

            <p className="text-lg font-bold text-orange-300 tracking-wide mb-2">
              Summoning your Warplets... 🔮
            </p>
            <p className="text-sm text-purple-300/80">
              Casting Halloween magic ✨
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    // Special handling for users without Warplet NFT
    if (error.startsWith("no_warplet:")) {
      const tokenId = error.split(":")[1];
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-8 border-2 border-orange-400/40 relative overflow-hidden">
            {/* Spooky Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-2 left-4 text-lg">🕸️</div>
              <div className="absolute top-6 right-6 text-lg">🕷️</div>
              <div className="absolute bottom-4 left-8 text-lg">🦇</div>
            </div>

            <div className="text-center mb-6 relative z-10">
              <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-full flex items-center justify-center border-2 border-orange-400/50 shadow-[0_0_30px_rgba(251,146,60,0.3)]">
                <div className="text-4xl animate-bounce">👻</div>
              </div>
              <h3 className="text-2xl font-nosifer font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-3 filter drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">
                No Warplet Found!
              </h3>
              <p className="text-sm text-purple-200/90 mb-6 leading-relaxed">
                Your cauldron is empty! 🪄 Brew your first Warplet before we can
                cast Halloween magic on it! ✨
              </p>
            </div>

            <div className="space-y-4 relative z-10">
              <a
                href="https://warpcast.com/~/composer-actions/compose?text=https://warplets.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold text-sm rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_25px_rgba(251,146,60,0.4)] relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative z-10 flex items-center justify-center gap-2">
                  🎃 Brew Your First Warplet 🧙‍♀️
                </span>
              </a>

              <div className="text-center bg-black/40 rounded-xl p-4 border border-purple-400/30">
                <p className="text-sm text-orange-300 mb-1">
                  🆔 Your Magical FID:{" "}
                  <span className="font-mono text-yellow-300">{tokenId}</span>
                </p>
                <p className="text-xs text-purple-300/80">
                  Create Warplet #{tokenId} first, then return for Halloween
                  cutification! 🎭
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Generic error state
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-red-900/80 via-orange-900/60 to-black/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-[0_0_40px_rgba(220,38,38,0.4)] border-2 border-red-400/50 relative overflow-hidden">
          {/* Spooky Error Decoration */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-3 left-3 text-xl animate-pulse">
              💀
            </div>
            <div
              className="absolute top-3 right-3 text-xl animate-pulse"
              style={{ animationDelay: "0.5s" }}
            >
              ⚡
            </div>
            <div
              className="absolute bottom-3 left-6 text-lg animate-pulse"
              style={{ animationDelay: "1s" }}
            >
              🔥
            </div>
          </div>

          <div className="relative z-10">
            <div className="text-4xl mb-4 animate-bounce">😱</div>
            <p className="text-red-200 font-bold mb-4 text-lg">
              Spell Gone Wrong!
            </p>
            <p className="text-red-300 font-semibold mb-2">⚠️ {error}</p>
            <div className="bg-black/40 rounded-lg p-3 border border-red-400/30">
              <p className="text-xs text-red-400 font-medium">
                🆔 FID: {farcasterContext.fid || "Mystery Spirit 👻"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show wallet connection prompt
  if (!isConnected) {
    // While detecting environment, avoid flashing the browser connect UI
    if (isMiniApp === null) {
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-10 text-center border-2 border-orange-400/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-purple-500/5 to-orange-500/5 animate-pulse"></div>

            <div className="relative z-10">
              <div className="relative inline-block mb-6">
                <div className="w-16 h-16 text-4xl animate-pulse">🔮</div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-purple-400/30 rounded-full"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-lg text-purple-200 font-medium">
                Preparing magical realm... ✨
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Mini app: show a minimal auto-connecting card (no Connect Wallet heading)
    if (isMiniApp === true) {
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-10 text-center border-2 border-orange-400/40 relative overflow-hidden">
            {/* Magical Connection Animation */}
            <div className="absolute inset-0">
              <div className="absolute top-4 left-6 text-lg animate-ping">
                ✨
              </div>
              <div
                className="absolute top-8 right-8 text-lg animate-ping"
                style={{ animationDelay: "0.5s" }}
              >
                ⭐
              </div>
              <div
                className="absolute bottom-6 left-4 text-lg animate-ping"
                style={{ animationDelay: "1s" }}
              >
                🌟
              </div>
            </div>

            <div className="relative z-10">
              <div className="relative inline-block mb-6">
                <div className="w-16 h-16 text-4xl animate-bounce">🧙‍♂️</div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-orange-400/30 rounded-full"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-lg text-orange-200 font-bold mb-2">
                Connecting to Warpcast Grimoire... 📜
              </p>
              <p className="text-sm text-purple-300/80">
                Establishing magical link ⚡
              </p>
              {farcasterContext.fid && (
                <div className="mt-4 bg-black/40 rounded-lg p-3 border border-orange-400/30">
                  <p className="text-xs text-orange-300">
                    🆔 Wizard ID:{" "}
                    <span className="font-mono text-yellow-300">
                      {farcasterContext.fid}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Browser: show AppKit button
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-10 text-center border-2 border-orange-400/40 relative overflow-hidden">
          {/* Floating Magic Elements */}
          <div className="absolute inset-0 overflow-hidden opacity-20">
            <div className="absolute top-6 left-8 text-2xl animate-float">
              🕯️
            </div>
            <div
              className="absolute top-12 right-6 text-xl animate-float"
              style={{ animationDelay: "1s" }}
            >
              🔮
            </div>
            <div
              className="absolute bottom-8 left-6 text-lg animate-float"
              style={{ animationDelay: "0.5s" }}
            >
              🧿
            </div>
          </div>

          <div className="relative z-10">
            {/* Magical Wallet Icon */}
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-full flex items-center justify-center border-2 border-orange-400/50 shadow-[0_0_30px_rgba(251,146,60,0.3)] relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-400/20 via-purple-400/20 to-orange-400/20 animate-pulse"></div>
              <div className="text-4xl animate-bounce">👛</div>
            </div>

            <h3 className="text-2xl font-butcherman font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-3 filter drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">
              Connect Your Wallet 🧙‍♀️
            </h3>
            <p className="text-lg text-purple-200/90 mb-8 leading-relaxed">
              Link your magical wallet to start cutifying your Warplets for
              Halloween! ✨🎃
            </p>

            <div className="space-y-6">
              <div className="p-1 bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400 rounded-2xl shadow-[0_0_25px_rgba(251,146,60,0.4)]">
                <div className="bg-black/80 rounded-xl p-2">
                  <w3m-button />
                </div>
              </div>

              <div className="bg-black/40 rounded-xl p-4 border border-purple-400/30">
                <p className="text-sm text-purple-300/90 flex items-center justify-center gap-2">
                  <span className="animate-pulse">🌟</span>
                  <span>Choose your preferred wallet above</span>
                  <span className="animate-pulse">🌟</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If connected but no Warplet selected yet, render selection or empty state (no manual token id)
  if (isConnected && !warpletData) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] p-6 border-2 border-orange-400/40 relative overflow-hidden">
          {/* Floating Decoration */}
          <div className="absolute inset-0 overflow-hidden opacity-10">
            <div className="absolute top-4 left-6 text-xl animate-float">
              🎭
            </div>
            <div
              className="absolute top-8 right-4 text-lg animate-float"
              style={{ animationDelay: "1s" }}
            >
              ✨
            </div>
            <div
              className="absolute bottom-6 left-4 text-lg animate-float"
              style={{ animationDelay: "0.5s" }}
            >
              🌙
            </div>
          </div>

          <div className="relative z-10">
            {ownedError ? (
              <div className="text-center">
                <div className="text-4xl mb-4 animate-bounce">😵</div>
                <p className="text-lg text-red-300 mb-6 font-medium">
                  Spell casting failed!
                </p>
                <p className="text-sm text-purple-200/90 mb-6">{ownedError}</p>
                <button
                  onClick={async () => {
                    if (!address) return;
                    setOwnedLoading(true);
                    setOwnedError(null);
                    try {
                      const nfts = await fetchUserWarplets(address);
                      setOwnedWarplets(nfts);
                      if (nfts.length === 1) {
                        const w = nfts[0];
                        setWarpletData({
                          tokenId: w.tokenId,
                          contractAddress:
                            "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
                          name: w.name || `Warplet #${w.tokenId}`,
                          description: w.description || "",
                          image: w.image,
                          attributes: w.attributes || [],
                        });
                      }
                    } catch (e) {
                      console.error(e);
                      setOwnedError(
                        "Unable to load your Warplets. Please try again."
                      );
                    } finally {
                      setOwnedLoading(false);
                    }
                  }}
                  className="inline-flex items-center px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold transition-all duration-300 hover:scale-[1.02] shadow-[0_0_25px_rgba(251,146,60,0.4)]"
                >
                  🔄 Cast Again
                </button>
              </div>
            ) : ownedWarplets.length === 0 ? (
              <div className="text-center">
                <div className="text-5xl mb-4 animate-bounce">🔍</div>
                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-3 filter drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">
                  No Warplets Discovered
                </h3>
                <p className="text-lg text-purple-200/90 mb-4">
                  Your spellbook appears empty! 📖
                </p>
                {isMiniApp ? (
                  <p className="text-sm text-purple-300/80 bg-black/40 rounded-lg p-3 border border-purple-400/30">
                    🧙‍♂️ This grimoire is linked to your Warpcast soul. If your
                    Warplets dwell in another realm...
                  </p>
                ) : (
                  <p className="text-sm text-purple-300/80 bg-black/40 rounded-lg p-3 border border-purple-400/30">
                    🔮 Connect the wallet that guards your Warplets
                  </p>
                )}
              </div>
            ) : ownedWarplets.length > 1 ? (
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-eater font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-2 filter drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">
                    Choose Your Halloween Victim 🎃👻
                  </h3>
                  <p className="text-sm text-purple-300/90">
                    Select a Warplet to transform with spooky magic! ✨
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {ownedWarplets.map((nft, index) => (
                    <button
                      key={nft.tokenId}
                      onClick={() =>
                        setWarpletData({
                          tokenId: nft.tokenId,
                          contractAddress:
                            "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
                          name: nft.name || `Warplet #${nft.tokenId}`,
                          description: nft.description || "",
                          image: nft.image,
                          attributes: nft.attributes || [],
                        })
                      }
                      className="group relative overflow-hidden rounded-2xl border-2 border-orange-400/30 hover:border-orange-400/80 bg-gradient-to-br from-purple-800/40 to-black/60 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(251,146,60,0.3)]"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      {/* Magical Hover Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-400/0 via-orange-400/20 to-orange-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                      <div className="aspect-square bg-gradient-to-br from-purple-900/50 to-black/80 relative overflow-hidden">
                        {nft.image ? (
                          <img
                            src={nft.image}
                            alt={nft.name || `Warplet #${nft.tokenId}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 group-hover:rotate-1"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-4xl animate-pulse">👻</div>
                          </div>
                        )}
                        {/* Magical Border Glow */}
                        <div className="absolute inset-0 border-2 border-orange-400/0 group-hover:border-orange-400/50 rounded-xl transition-all duration-300"></div>
                      </div>

                      <div className="p-3 relative z-10">
                        <div className="text-sm font-bold text-orange-200 truncate mb-1">
                          {nft.name || `Warplet #${nft.tokenId}`}
                        </div>
                        <div className="text-xs text-purple-300/80 font-mono">
                          🆔 {nft.tokenId}
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100">
                        <span className="text-xs">✨</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // If exactly one, we likely already auto-selected; render a subtle message
              <div className="text-center py-8">
                <div className="text-4xl mb-4 animate-pulse">🎭</div>
                <p className="text-lg text-purple-200/90 font-medium">
                  Preparing your Warplet for transformation... ✨
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render mutation component
  return (
    <div className="w-full">
      {warpletData && <MutationComponent nftData={warpletData} />}
    </div>
  );
}
