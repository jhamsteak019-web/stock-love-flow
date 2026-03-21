import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId } = await req.json();
    if (!reportId) {
      return new Response(JSON.stringify({ error: "reportId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get report record
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download the PDF file
    const fileUrl = report.file_url;
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error("Failed to download PDF");
    }

    // Extract text from PDF using a simple approach
    const pdfBytes = await pdfResponse.arrayBuffer();
    const pdfText = extractTextFromPDF(new Uint8Array(pdfBytes));

    // Use AI to convert text to slides
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a presentation designer. Convert report text into clean presentation slides.
              
Rules:
- Create 5-15 slides depending on content length
- First slide is always a title slide with the report title and subtitle
- Each slide has: title (string), content (array of bullet points as strings), type ("title" | "content" | "summary")
- Keep bullet points concise (max 15 words each)
- Max 6 bullet points per slide
- Summarize long paragraphs into key points
- Last slide should be a summary/conclusion
- Return ONLY valid JSON array, no markdown

Format: [{"title": "...", "content": ["point 1", "point 2"], "type": "title|content|summary"}]`,
            },
            {
              role: "user",
              content: `Convert this report into presentation slides:\n\n${pdfText.substring(0, 15000)}`,
            },
          ],
          temperature: 0.3,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    let slidesText = aiData.choices?.[0]?.message?.content || "[]";

    // Clean markdown code fences if present
    slidesText = slidesText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let slides;
    try {
      slides = JSON.parse(slidesText);
    } catch {
      console.error("Failed to parse AI response:", slidesText);
      slides = [
        {
          title: report.title || "Report",
          content: ["Could not parse report content. Please try again."],
          type: "title",
        },
      ];
    }

    // Update report with slides
    const { error: updateError } = await supabase
      .from("reports")
      .update({ slides, status: "ready" })
      .eq("id", reportId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to save slides");
    }

    return new Response(
      JSON.stringify({ success: true, slides }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simple PDF text extraction - extracts readable text from PDF binary
function extractTextFromPDF(bytes: Uint8Array): string {
  const text: string[] = [];
  const str = new TextDecoder("latin1").decode(bytes);
  
  // Extract text between BT and ET markers (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = tjMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\([()])/g, "$1");
      if (decoded.trim()) text.push(decoded);
    }
    
    // TJ array operator
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const items = tjArrMatch[1];
      const itemRegex = /\(([^)]*)\)/g;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(items)) !== null) {
        const decoded = itemMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\\\/g, "\\")
          .replace(/\\([()])/g, "$1");
        if (decoded.trim()) text.push(decoded);
      }
    }
  }
  
  // If BT/ET extraction failed, try stream content
  if (text.length === 0) {
    const streamRegex = /stream\s([\s\S]*?)endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(str)) !== null) {
      const content = streamMatch[1];
      // Only grab printable ASCII sections
      const printable = content.replace(/[^\x20-\x7E\n\r\t]/g, " ");
      const words = printable.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 5) {
        text.push(words.join(" "));
      }
    }
  }

  const result = text.join(" ").replace(/\s+/g, " ").trim();
  return result || "No readable text could be extracted from this PDF.";
}
