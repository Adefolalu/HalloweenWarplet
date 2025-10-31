import { GoogleGenAI } from "@google/genai";

export interface ImageGenerationOptions {
  prompt: string;
  imageUrl?: string;
  strength?: number; // 0-1, how much to transform (0.3 = subtle, 0.8 = heavy)
  negativePrompt?: string;
  customPrompt?: string; // Optional full custom prompt override
}

export interface ImageGenerationResult {
  imageUrl: string;
  service: "gemini";
  metadata?: any;
}

export class ImageGenerationService {
  private geminiAI: GoogleGenAI | null = null;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
    if (this.apiKey) {
      this.geminiAI = new GoogleGenAI({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Generate mutated image using Gemini's native image generation
   */
  async generateMutatedImage(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const { imageUrl, customPrompt } = options;

    // If we have Gemini API, use it for native image generation
    if (this.geminiAI && imageUrl) {
      try {
        console.log("🎨 Generating mutated image with ...");

        const config = {
          responseModalities: ["IMAGE", "TEXT"],
        };

        const model = "gemini-2.5-flash-image";

        // First, fetch and convert the original image to base64
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        const imageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve(base64);
          };
          reader.readAsDataURL(imageBlob);
        });

        const mimeType = imageBlob.type || "image/jpeg";

        // Use custom prompt if provided, otherwise use default
        const promptText =
          customPrompt ||
          `Transform this character into an ADORABLY CUTE HALLOWEEN creature version #{n}.
Keep the base form and recognizable traits, but make the vibe cozy, friendly, and festive:
- Dress it in charming Halloween motifs: tiny witch hats, bat wings, soft ghost sheets, pumpkin/jack-o'-lantern accents, candy corn patterns, cute cobwebs, tiny stars.
- Use soft, pastel-forward palettes: warm oranges, lavender purples, mint/slime greens, creamy whites, midnight accents; gentle gradients and plush textures.
- Emphasize round, kawaii shapes, big expressive eyes, gentle smiles, plush/velvety surfaces, and soft highlights.
- Add playful magical effects: subtle sparkles, soft glows, floating candy, friendly fireflies, gentle moonlight rim light.
- Invert the background color or add a soft slime/fog/mist effect to make it feel whimsically spooky but wholesome.
- Keep the background composition similar to the original, just lightly decorated with Halloween ambiance.
Art direction: cute illustration style, high-quality digital painting, soft cinematic lighting, gentle volumetric fog, crisp yet soft-edged details. High resolution, clean lines, no text, no watermark, no logos. Avoid horror/gore/realistic violence or anything unsettling.
Output: a single centered composition featuring the full character with the above Halloween-cute enhancements.
`;

        const contents = [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ];

        const response = await this.geminiAI.models.generateContentStream({
          model,
          config,
          contents,
        });

        // Collect the generated image from the stream
        for await (const chunk of response) {
          if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
            continue;
          }

          const inlineData = chunk.candidates[0].content.parts[0].inlineData;
          if (inlineData?.data && inlineData?.mimeType) {
            // Convert base64 to data URL
            const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;

            console.log("✅ Gemini image generation successful!");
            return {
              imageUrl: dataUrl,
              service: "gemini",
              metadata: {
                model: "gemini-2.5-flash-image",
                mimeType: inlineData.mimeType,
              },
            };
          }
        }

        throw new Error("No image data in Gemini response");
      } catch (error) {
        console.error("❌ Gemini image generation failed:", error);
        throw error;
      }
    }

    throw new Error("Gemini API not available or no image URL provided");
  }

  /**
   * Check if Gemini image generation is available
   */
  isGeminiAvailable(): boolean {
    return !!this.geminiAI;
  }
}
