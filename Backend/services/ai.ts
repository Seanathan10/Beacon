/**
 * Gemini AI Service
 * Provides itinerary generation and sustainability tips using Google GenAI SDK.
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.0-flash";

// Lazy initialization - allow module to load even without API key
let ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
    if (!ai) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("Gemini API key not configured");
        }
        ai = new GoogleGenAI({ apiKey });
    }
    return ai;
}

// -- Types --

export interface ItineraryDay {
    day: number;
    title: string;
    activities: {
        time: string;
        name: string;
        description: string;
        location?: string;
        transportNote?: string;
    }[];
}

export interface ItineraryResult {
    summary: string;
    days: ItineraryDay[];
    sustainabilityTips: string[];
    carbonOffsetSuggestions: string[];
}

export interface LocalPin {
    id: number;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
}

// -- Schemas --

const itinerarySchema = {
    type: "OBJECT",
    properties: {
        summary: { type: "STRING" },
        days: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    day: { type: "INTEGER" },
                    title: { type: "STRING" },
                    activities: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                time: { type: "STRING" },
                                name: { type: "STRING" },
                                description: { type: "STRING" },
                                location: { type: "STRING" },
                                transportNote: { type: "STRING" },
                            },
                            required: ["time", "name", "description"],
                        },
                    },
                },
                required: ["day", "title", "activities"],
            },
        },
        sustainabilityTips: { type: "ARRAY", items: { type: "STRING" } },
        carbonOffsetSuggestions: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["summary", "days", "sustainabilityTips", "carbonOffsetSuggestions"],
};

const carbonComparisonSchema = {
    type: "OBJECT",
    properties: {
        comparison: { type: "STRING" },
        savingsPercent: { type: "NUMBER" },
        recommendation: { type: "STRING" },
    },
    required: ["comparison", "savingsPercent", "recommendation"],
};

// -- Functions --

/**
 * Generate an itinerary using Gemini based on destination, type, and local pins
 */
export async function generateItinerary(
    destination: string,
    itineraryType: string,
    durationDays: number,
    localPins: LocalPin[],
    transitSummary: string
): Promise<ItineraryResult> {
    const pinsContext = localPins.length > 0
        ? `Here are community-recommended local spots to consider including:\n${localPins.map(p => `- ${p.title}: ${p.description}`).join("\n")}`
        : "No specific local recommendations available, suggest general hidden gems.";

    const prompt = `You are a sustainable travel planner. Create a ${durationDays}-day itinerary for ${destination} with a "${itineraryType}" theme.
    
${pinsContext}

Transit context: ${transitSummary}

Generate a detailed itinerary with sustainability tips and carbon offset suggestions.`;

    // Helper to parse response
    const parseResponse = (response: any): ItineraryResult | null => {
        try {
            if (response.parsed) {
                return response.parsed as ItineraryResult;
            } else if (response.text) {
                return JSON.parse(response.text) as ItineraryResult;
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
        }
        return null;
    };

    // First attempt: with grounding (may fail with empty content on some model versions)
    try {
        const response = await getAiClient().models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: itinerarySchema,
                tools: [{ googleSearch: {} }], // Enable Grounding
            },
        });

        const result = parseResponse(response);
        if (result) {
            return result;
        }
        // If response is empty, fall through to retry without grounding
        console.warn("Gemini returned empty content with grounding enabled, retrying without grounding...");
    } catch (err) {
        console.warn("Grounded request failed, retrying without grounding:", err);
    }

    // Fallback: without grounding (more reliable for structured JSON output)
    try {
        const fallbackResponse = await getAiClient().models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: itinerarySchema,
                // No grounding - more reliable for structured output
            },
        });

        const fallbackResult = parseResponse(fallbackResponse);
        if (fallbackResult) {
            return fallbackResult;
        }
    } catch (err) {
        console.error("Fallback itinerary generation failed:", err);
    }

    throw new Error(`Failed to generate valid itinerary JSON.`);
}

/**
 * Generate comparative carbon analysis
 */
export async function generateCarbonComparison(
    origin: string,
    destination: string,
    transitOptions: { mode: string; carbonKg: number }[],
    flightCarbonKg: number
): Promise<{
    comparison: string;
    savingsPercent: number;
    recommendation: string;
}> {
    const lowestTransit = transitOptions.reduce((min, opt) =>
        opt.carbonKg < min.carbonKg ? opt : min, transitOptions[0] || { mode: "N/A", carbonKg: flightCarbonKg });

    const prompt = `Provide a brief carbon comparison for travel from ${origin} to ${destination}.

Flight emissions: ${flightCarbonKg} kg CO2
Best transit option: ${lowestTransit.mode} at ${lowestTransit.carbonKg} kg CO2

Calculate savings and provide a recommendation.`;

    try {
        const response = await getAiClient().models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: carbonComparisonSchema,
                // No grounding needed for math/comparison of provided data
            },
        });

        if ((response as any).parsed) {
            return (response as any).parsed as {
                comparison: string;
                savingsPercent: number;
                recommendation: string;
            };
        } else if (response.text) {
            return JSON.parse(response.text);
        }
    } catch (err) {
        console.error("Carbon comparison generation failed:", err);
    }

    throw new Error("Failed to generate carbon comparison");
}

/**
 * Answer user questions about the trip with grounding context
 */
export async function answerTripQuestion(
    question: string,
    context: {
        origin: string;
        destination: string;
        itineraryType: string;
        localPins: LocalPin[];
    }
): Promise<string> {
    const pinsInfo = context.localPins.map(p => `${p.title}: ${p.description}`).join("; ");

    const prompt = `You are a helpful sustainable travel assistant. Answer this question about traveling from ${context.origin} to ${context.destination} (${context.itineraryType} theme).

Local recommendations: ${pinsInfo || "None available"}

Question: ${question}

Provide a helpful, concise answer focused on sustainability and local experiences.`;

    try {
        const response = await getAiClient().models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
            config: {
                tools: [{ googleSearch: {} }], // Enable Grounding for questions
            },
        });

        if (response.text) {
            return response.text;
        }
    } catch (err) {
        console.error("Trip question answering failed:", err);
    }

    return "I'm sorry, I couldn't generate an answer at this time. Please try again later.";
}
