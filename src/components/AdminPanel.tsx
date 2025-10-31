import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  getContractBalance,
  getContractOwner,
  withdrawTreasury,
} from "../services/treasuryService";

export default function AdminPanel() {
  const { address, isConnected } = useAccount();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<`0x${string}` | null>(null);

  const [balanceEth, setBalanceEth] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const shortAddr = useMemo(() => {
    if (!ownerAddress) return "";
    return `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`;
  }, [ownerAddress]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!isConnected || !address) return;
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const [owner, bal] = await Promise.all([
          getContractOwner(),
          getContractBalance(),
        ]);
        if (!mounted) return;
        setOwnerAddress(owner);
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        setBalanceEth(bal.eth);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.shortMessage || e?.message || "Failed to load admin data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [isConnected, address]);

  if (!isConnected || isOwner === false) {
    return null; // hidden for non-owners
  }

  // While determining ownership, render a subtle skeleton
  if (isOwner === null) {
    return (
      <div className="mb-6">
        <div className="bg-gradient-to-br from-orange-900/20 to-purple-800/10 border-2 border-orange-400/20 rounded-3xl p-4 animate-pulse backdrop-blur-sm" />
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="bg-gradient-to-br from-orange-900/40 via-purple-900/30 to-black/60 backdrop-blur-xl border-2 border-orange-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(251,146,60,0.3)] relative overflow-hidden">
        {/* Floating Halloween Elements */}
        <div className="absolute inset-0 opacity-20 overflow-hidden pointer-events-none">
          <div className="absolute top-2 left-4 text-lg animate-float">💰</div>
          <div
            className="absolute top-4 right-6 text-sm animate-float"
            style={{ animationDelay: "1s" }}
          >
            👑
          </div>
          <div
            className="absolute bottom-3 left-8 text-sm animate-float"
            style={{ animationDelay: "0.5s" }}
          >
            ✨
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-yellow-500/30 flex items-center justify-center border border-orange-400/50">
                <span className="text-lg">🎃</span>
              </div>
              <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300">
                Halloween Treasury
              </h2>
            </div>
            {ownerAddress && (
              <div className="bg-black/40 rounded-lg px-2 py-1 border border-orange-400/30">
                <div className="text-xs text-orange-300 font-mono">
                  👑 {shortAddr}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-200 bg-gradient-to-r from-red-900/50 to-red-800/40 border border-red-500/50 rounded-xl p-3 mb-4 backdrop-blur-sm">
              <span className="text-lg mr-2">⚠️</span>
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-200 bg-gradient-to-r from-emerald-900/50 to-green-800/40 border border-emerald-500/50 rounded-xl p-3 mb-4 backdrop-blur-sm">
              <span className="text-lg mr-2">✅</span>
              {success}
            </div>
          )}

          <div className="flex items-center justify-between bg-black/30 rounded-2xl p-4 border border-orange-400/30">
            <div>
              <p className="text-sm text-purple-300/80 mb-1">
                🏦 Treasury Balance
              </p>
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300">
                {loading ? (
                  <span className="animate-pulse">🔮 Calculating...</span>
                ) : (
                  `${Number(balanceEth).toFixed(4)} ETH`
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const bal = await getContractBalance();
                    setBalanceEth(bal.eth);
                  } catch (e: any) {
                    setError(
                      e?.shortMessage ||
                        e?.message ||
                        "Failed to refresh balance."
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-600/30 text-purple-200 hover:bg-purple-600/50 border border-purple-400/40 disabled:opacity-60 transition-all duration-300 hover:scale-[1.02]"
              >
                🔄 Refresh
              </button>
              <button
                disabled={withdrawing || loading || Number(balanceEth) <= 0}
                onClick={async () => {
                  setWithdrawing(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const hash = await withdrawTreasury();
                    setSuccess(
                      `Withdrawal sent! Tx: ${hash.slice(0, 8)}…${hash.slice(-6)}`
                    );
                    // refresh balance after success
                    const bal = await getContractBalance();
                    setBalanceEth(bal.eth);
                  } catch (e: any) {
                    const msg: string =
                      e?.shortMessage || e?.message || "Withdrawal failed.";
                    if (msg.toLowerCase().includes("user rejected")) {
                      setError("Transaction cancelled.");
                    } else if (
                      msg.toLowerCase().includes("unauthorized") ||
                      msg.toLowerCase().includes("onlyowner")
                    ) {
                      setError("Only the owner can withdraw.");
                    } else {
                      setError(msg);
                    }
                  } finally {
                    setWithdrawing(false);
                  }
                }}
                className="px-6 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white shadow-[0_0_25px_rgba(251,146,60,0.4)] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] relative overflow-hidden group"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative z-10">
                  {withdrawing ? "🎃 Withdrawing..." : "💰 Withdraw"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
