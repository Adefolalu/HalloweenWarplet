import { useEffect, useMemo, useState } from "react";
import type { NFTData } from "../hooks/useMutation";
import { blobFromUrl, uploadImageBlob, uploadMetadata } from "../services/ipfs";
import { mintMutant } from "../services/mintService";
import { ImageGenerationService } from "../services/imageGeneration";
import { useReadContract } from "wagmi";
import { mutantWarplet } from "../constants/Abi";
import { formatEther } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";

interface MutationComponentProps {
  nftData?: NFTData;
}

export function MutationComponent({ nftData }: MutationComponentProps) {
  // Single mutation state
  type MutationStatus = "pending" | "generating" | "ready" | "error";
  type MutationResult = {
    mutatedImageUrl: string;
    imageGenerationService: "gemini";
  };

  type MintSuccessData = {
    hash: string;
    tokenId?: bigint;
    imageUri: string;
    name: string;
  };

  const [status, setStatus] = useState<MutationStatus>("pending");
  const [result, setResult] = useState<MutationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [mintSuccessData, setMintSuccessData] =
    useState<MintSuccessData | null>(null);
  const [isMinting, setIsMinting] = useState(false);

  const imageService = useMemo(() => new ImageGenerationService(), []);

  // Read the mutation fee from the contract
  const { data: mutationFee } = useReadContract({
    address: mutantWarplet.address as `0x${string}`,
    abi: mutantWarplet.abi,
    functionName: "mutationFee",
  }) as { data: bigint | undefined };

  useEffect(() => {
    if (!nftData?.image) return;

    let cancelled = false;

    async function generateMutation() {
      setStatus("generating");
      setError(null);

      try {
        const img = await imageService.generateMutatedImage({
          prompt: "cute halloween warplet",
          imageUrl: nftData!.image,
          strength: 0.75,
          negativePrompt: "",
        });

        if (cancelled) return;

        setResult({
          mutatedImageUrl: img.imageUrl,
          imageGenerationService: img.service,
        });
        setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        console.error("Cutify generation failed:", e);
        setError("Unable to create cutified version. Please try again later.");
        setStatus("error");
      }
    }

    generateMutation();
    return () => {
      cancelled = true;
    };
  }, [nftData?.tokenId, imageService]);

  if (!nftData) return null;

  const handleRetry = async () => {
    setStatus("generating");
    setError(null);

    try {
      const img = await imageService.generateMutatedImage({
        prompt: "cyberpunk mutant",
        imageUrl: nftData.image,
        strength: 0.75,
        negativePrompt: "",
      });

      setResult({
        mutatedImageUrl: img.imageUrl,
        imageGenerationService: img.service,
      });
      setStatus("ready");
    } catch (e: any) {
      console.error("Retry cutify failed:", e);
      setError("Unable to create cutified version. Please try again later.");
      setStatus("error");
    }
  };

  const handleRemutate = async () => {
    setStatus("generating");
    setError(null);

    // Store the current result before clearing it
    const previousResult = result;
    setResult(null);

    try {
      // Use the current mutated image if available, otherwise fall back to original
      const sourceImage = previousResult?.mutatedImageUrl || nftData.image;

      const img = await imageService.generateMutatedImage({
        prompt: "cute halloween warplet remix",
        imageUrl: sourceImage,
        strength: 0.75,
        negativePrompt: "",
        customPrompt: `Create an ALTERNATIVE CUTE HALLOWEEN Warplet with a completely different aesthetic.
Keep the base form recognizable, but this time go in a DIFFERENT DIRECTION:
- Use a completely different pastel color palette (e.g., if previous was orange/purple, try mint/pink, lavender/cream, or peach/teal).
- Change the Halloween costume style: if previous had witch vibes, try ghost sprite, pumpkin friend, candy wizard, or bat familiar.
- Add different accessories: maybe a different hat style, new wings, alternative candy decorations, or unique Halloween props.
- Experiment with different soft lighting: warm candlelight glow, cool moonlight shimmer, or sparkly magic aura.
- Vary the background atmosphere: misty forest, cozy pumpkin patch, starry night sky, or soft fog with fireflies.
- Make this version feel like a REMIX or ALTERNATE COSTUME - distinctly different but equally charming and wholesome.
Style: cute illustration, high-quality digital painting, soft cinematic lighting, gentle atmosphere, cozy Halloween vibes. No horror/gore.
`,
      });

      setResult({
        mutatedImageUrl: img.imageUrl,
        imageGenerationService: img.service,
      });
      setStatus("ready");
    } catch (e: any) {
      console.error("Re-cutify failed:", e);
      setError(
        "Unable to create new cutified version. Please try again later."
      );
      setStatus("error");

      // Restore previous result if re-cutify failed
      if (previousResult) {
        setResult(previousResult);
        setStatus("ready");
        setError(null); // Clear error since we restored the previous result
      }
    }
  };

  const handleProceedToMint = async () => {
    try {
      if (!result || status !== "ready" || isMinting) return;

      setIsMinting(true);

      // Trigger haptic feedback on mint button press
      try {
        await sdk.haptics.impactOccurred("medium");
      } catch (e) {
        // Haptics may not be available on all devices
        console.debug("Haptic feedback not available:", e);
      }

      // 1) Prepare image blob (handles data URLs and http URLs)
      const imageBlob = await blobFromUrl(result.mutatedImageUrl);
      // 2) Upload image to IPFS
      const imageUri = await uploadImageBlob(imageBlob);
      // 3) Build metadata
      const name = `Cutified ${nftData.name}`;
      const description = `Adorable Halloween version of ${nftData.name}`;
      const attributes = [
        ...(nftData.attributes || []),
        {
          trait_type: "Halloween Style",
          value: "Cutified",
        },
      ];
      const metadataUri = await uploadMetadata({
        name,
        description,
        image: imageUri,
        attributes,
        properties: {
          origin: {
            contract: nftData.contractAddress,
            tokenId: nftData.tokenId,
          },
        },
      });

      // 4) Mint on Base
      const originTokenId = BigInt(nftData.tokenId);
      const { hash, tokenId } = await mintMutant({
        originContract: nftData.contractAddress as `0x${string}`,
        originTokenId,
        metadataURI: metadataUri,
      });

      // Success haptic feedback
      try {
        await sdk.haptics.notificationOccurred("success");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      // Show success modal
      setMintSuccessData({
        hash,
        tokenId,
        imageUri,
        name,
      });
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error("Mint flow failed:", err);

      // Error haptic feedback
      try {
        await sdk.haptics.notificationOccurred("error");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      // Better error messages
      let errorMessage = "Mint failed";
      if (
        err?.message?.includes("User rejected") ||
        err?.message?.includes("rejected")
      ) {
        errorMessage = "Transaction cancelled";
      } else if (err?.message) {
        errorMessage = err.message;
      }

      alert(errorMessage);
    } finally {
      setIsMinting(false);
    }
  };

  const handleShare = async () => {
    if (!mintSuccessData) return;

    try {
      const miniAppUrl = "https://halloween-ten-blond.vercel.app";
      const text = `I just cutified my ${mintSuccessData.name} for Halloween! 🎃✨\n\nCutify your Warplet now on Halloween Warplets!`;

      await sdk.actions.composeCast({
        text,
        embeds: [mintSuccessData.imageUri, miniAppUrl] as [string, string],
      });
    } catch (error) {
      console.error("Failed to compose cast:", error);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    setMintSuccessData(null);
  };

  return (
    <div className="relative">
      {/* Halloween Spooky Card */}
      <div className="relative bg-gradient-to-br from-purple-900/80 via-indigo-900/70 to-black/90 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] overflow-hidden border-2 border-orange-400/40">
        {/* Magical Halloween Accent */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-orange-400 to-transparent"></div>

        {/* Floating Halloween Decorations */}
        <div className="absolute inset-0 overflow-hidden opacity-10 pointer-events-none">
          <div className="absolute top-4 left-6 text-lg animate-float">🕯️</div>
          <div
            className="absolute top-8 right-4 text-sm animate-float"
            style={{ animationDelay: "1s" }}
          >
            ✨
          </div>
          <div
            className="absolute bottom-6 left-4 text-lg animate-float"
            style={{ animationDelay: "0.5s" }}
          >
            🔮
          </div>
        </div>

        {/* Image container with fixed aspect ratio */}
        <div className="relative w-full" style={{ paddingBottom: "100%" }}>
          <div className="absolute inset-0 flex items-center justify-center p-8">
            {status !== "ready" || !result ? (
              <div className="w-full h-full bg-gradient-to-br from-purple-800/60 via-indigo-800/50 to-black/70 rounded-2xl flex items-center justify-center border-2 border-orange-400/30 backdrop-blur-sm relative overflow-hidden">
                {/* Magical Background Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-purple-500/5 to-orange-500/5 animate-pulse"></div>

                <div className="text-center px-4 relative z-10">
                  {status === "error" ? (
                    <>
                      <div className="w-20 h-20 mx-auto mb-4 bg-red-900/40 rounded-full flex items-center justify-center border-2 border-red-400/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] relative">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/20 to-orange-500/20 animate-pulse"></div>
                        <div className="text-3xl animate-bounce">💀</div>
                      </div>
                      <p className="text-lg font-nosifer font-bold text-red-300 mb-2">
                        Spell Failed!
                      </p>
                      <p className="text-sm text-purple-200/90 mb-6">{error}</p>
                      <button
                        onClick={handleRetry}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_25px_rgba(251,146,60,0.4)]"
                      >
                        🔄 Cast Again
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Halloween Cauldron Loading Animation */}
                      <div className="relative inline-block mb-6">
                        <div className="w-20 h-20 relative">
                          {/* Cauldron */}
                          <div className="text-4xl animate-bounce">🧙‍♀️</div>
                          {/* Magic Circle */}
                          <div className="absolute inset-0 w-20 h-20 border-4 border-orange-400/30 rounded-full"></div>
                          <div className="absolute inset-0 w-20 h-20 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                          {/* Sparkles */}
                          <div className="absolute -top-2 -left-2 text-sm animate-ping">
                            ✨
                          </div>
                          <div
                            className="absolute -top-2 -right-2 text-sm animate-ping"
                            style={{ animationDelay: "0.5s" }}
                          >
                            ⭐
                          </div>
                          <div
                            className="absolute -bottom-2 left-1/2 text-sm animate-ping"
                            style={{ animationDelay: "1s" }}
                          >
                            🌟
                          </div>
                        </div>
                      </div>
                      <p className="text-xl font-creepster font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-2 filter drop-shadow-[0_0_10px_rgba(251,146,60,0.8)]">
                        🎃 CUTIFYING... ✨
                      </p>
                      <p className="text-sm font-butcherman text-purple-300/90">
                        Brewing Halloween magic... 🧪
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full group">
                <img
                  src={result.mutatedImageUrl}
                  alt="Cutified Halloween Warplet"
                  className="w-full h-full object-cover rounded-2xl shadow-[0_0_30px_rgba(251,146,60,0.3)] ring-2 ring-orange-400/40"
                />
                {/* Magical Halloween Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-orange-400/20 via-purple-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>

                {/* Floating Magic Sparkles on Hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div
                    className="absolute top-4 left-4 text-lg animate-ping"
                    style={{ animationDelay: "0s" }}
                  >
                    ✨
                  </div>
                  <div
                    className="absolute top-6 right-6 text-lg animate-ping"
                    style={{ animationDelay: "0.3s" }}
                  >
                    ⭐
                  </div>
                  <div
                    className="absolute bottom-8 left-8 text-lg animate-ping"
                    style={{ animationDelay: "0.6s" }}
                  >
                    🌟
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 space-y-2">
          {/* Re-cutify button - only show when ready and not minting */}
          {status === "ready" && !isMinting && (
            <button
              onClick={handleRemutate}
              className="w-full py-2.5 rounded-xl font-medium text-xs tracking-wide text-orange-400 bg-slate-700/50 hover:bg-slate-700 border border-orange-400/30 hover:border-orange-400/50 shadow-[0_2px_12px_rgba(251,146,60,0.15)] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            >
              🎃 TRY ANOTHER COSTUME
            </button>
          )}

          {/* Mint button with Halloween styling */}
          <button
            disabled={status !== "ready" || isMinting}
            onClick={handleProceedToMint}
            className={`w-full py-3 rounded-xl font-semibold text-sm tracking-wide text-white shadow-[0_4px_16px_rgba(251,146,60,0.25)] transition-all duration-300 relative overflow-hidden group ${
              status === "ready" && !isMinting
                ? "bg-orange-500 hover:bg-orange-600 hover:shadow-[0_6px_24px_rgba(251,146,60,0.4)] hover:scale-[1.01] active:scale-[0.99]"
                : "bg-gray-300 cursor-not-allowed opacity-60"
            }`}
          >
            {/* Shimmer effect on hover */}
            {status === "ready" && !isMinting && (
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            )}

            {isMinting ? (
              <span className="flex items-center justify-center gap-2 relative z-10">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                MINTING...
              </span>
            ) : status === "ready" ? (
              <span className="flex flex-col items-center justify-center gap-1 relative z-10">
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  🎃 MINT COSTUME
                </span>
                <span className="text-[10px] font-butcherman font-medium opacity-90 tracking-wide">
                  {mutationFee ? formatEther(mutationFee) : "0.00037"} ETH
                </span>
              </span>
            ) : (
              <span className="font-butcherman uppercase tracking-wider text-sm">
                🎭 Preparing Costume...
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Halloween Success Modal */}
      {showSuccessModal && mintSuccessData && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-gradient-to-br from-purple-900/90 via-indigo-900/80 to-black/95 rounded-3xl shadow-[0_0_50px_rgba(147,51,234,0.6)] max-w-md w-full border-2 border-orange-400/50 overflow-hidden relative">
            {/* Magical Top Accent */}
            <div className="h-[3px] bg-gradient-to-r from-transparent via-orange-400 to-transparent"></div>

            {/* Floating Celebration Elements */}
            <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
              <div className="absolute top-6 left-8 text-lg animate-bounce">
                🎉
              </div>
              <div
                className="absolute top-12 right-6 text-lg animate-bounce"
                style={{ animationDelay: "0.5s" }}
              >
                ✨
              </div>
              <div
                className="absolute bottom-8 left-6 text-lg animate-bounce"
                style={{ animationDelay: "1s" }}
              >
                🎊
              </div>
            </div>

            {/* Content */}
            <div className="p-8 text-center relative z-10">
              {/* Halloween Success Celebration */}
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-full flex items-center justify-center border-2 border-orange-400/60 shadow-[0_0_30px_rgba(251,146,60,0.4)] relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-400/20 via-purple-400/20 to-orange-400/20 animate-pulse"></div>
                <div className="text-5xl animate-bounce">🎃</div>
              </div>

              <h2 className="text-3xl font-creepster font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-3 filter drop-shadow-[0_0_15px_rgba(251,146,60,0.8)]">
                Costume Created! 🎭
              </h2>

              <p className="text-lg font-butcherman text-orange-200/90 mb-6">
                {mintSuccessData.name}
              </p>

              {/* Halloween Cutified Image */}
              <div className="mb-6 rounded-2xl overflow-hidden border-2 border-orange-400/50 shadow-[0_0_30px_rgba(251,146,60,0.3)] relative group">
                <img
                  src={mintSuccessData.imageUri}
                  alt={mintSuccessData.name}
                  className="w-full h-auto"
                  onError={(e) => {
                    // Fallback to mutated image if IPFS image fails to load
                    if (result?.mutatedImageUrl) {
                      (e.target as HTMLImageElement).src =
                        result.mutatedImageUrl;
                    }
                  }}
                />
                {/* Magical Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-orange-400/10 via-transparent to-purple-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              </div>

              {/* Magical Transaction Scroll */}
              <div className="bg-black/60 rounded-xl p-4 mb-6 text-sm border border-orange-400/30 relative">
                <div className="absolute top-2 right-2 text-lg">📜</div>
                <p className="text-orange-300/90 mb-2 font-butcherman">
                  Spell Receipt:
                </p>
                <p className="text-yellow-300 font-mono break-all text-xs bg-black/40 p-2 rounded">
                  {mintSuccessData.hash.slice(0, 12)}...
                  {mintSuccessData.hash.slice(-10)}
                </p>
                {mintSuccessData.tokenId !== undefined && (
                  <>
                    <p className="text-orange-300/90 mt-3 mb-2 font-butcherman">
                      Costume ID:
                    </p>
                    <p className="text-yellow-300 font-mono text-lg">
                      #{mintSuccessData.tokenId.toString()}
                    </p>
                  </>
                )}
              </div>

              {/* Halloween Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleShare}
                  className="w-full py-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 shadow-[0_0_25px_rgba(251,146,60,0.4)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  <span className="text-lg">🎃</span>
                  <span className="font-butcherman relative z-10">
                    Share Halloween Magic
                  </span>
                  <span className="text-lg">✨</span>
                </button>

                <button
                  onClick={handleCloseModal}
                  className="w-full py-3 rounded-xl font-medium text-sm text-orange-300 bg-black/60 hover:bg-black/80 border border-orange-400/40 hover:border-orange-400/60 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] font-butcherman"
                >
                  Return to Cauldron 🧙‍♀️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
