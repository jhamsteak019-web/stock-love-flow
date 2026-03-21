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

    const pdfBytes = await pdfResponse.arrayBuffer();
    const pdfText = extractTextFromPDF(new Uint8Array(pdfBytes));

    // Split text into slides directly - NO summarization, exact content
    const slides = splitTextIntoSlides(pdfText, report.title);

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

// Split raw text into slides - exact content, no summarization
function splitTextIntoSlides(text: string, title: string) {
  const slides: { title: string; content: string[]; type: string }[] = [];

  // Title slide
  slides.push({
    title: title || "Report",
    content: [],
    type: "title",
  });

  if (!text || text === "No readable text could be extracted from this PDF.") {
    slides.push({
      title: "Content",
      content: ["No readable text could be extracted from this PDF. The file may be scanned/image-based."],
      type: "content",
    });
    return slides;
  }

  // Split by double newlines (paragraphs) or long single sections
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  const MAX_LINES_PER_SLIDE = 8;
  const MAX_CHARS_PER_SLIDE = 600;
  
  let currentLines: string[] = [];
  let currentChars = 0;
  let slideNumber = 1;

  for (const line of lines) {
    // Check if adding this line would exceed limits
    if (currentLines.length >= MAX_LINES_PER_SLIDE || 
        (currentChars + line.length > MAX_CHARS_PER_SLIDE && currentLines.length > 0)) {
      slides.push({
        title: `Page ${slideNumber}`,
        content: [...currentLines],
        type: "content",
      });
      slideNumber++;
      currentLines = [];
      currentChars = 0;
    }
    
    currentLines.push(line);
    currentChars += line.length;
  }

  // Push remaining lines
  if (currentLines.length > 0) {
    slides.push({
      title: `Page ${slideNumber}`,
      content: [...currentLines],
      type: "content",
    });
  }

  return slides;
}

// Simple PDF text extraction
function extractTextFromPDF(bytes: Uint8Array): string {
  const text: string[] = [];
  const str = new TextDecoder("latin1").decode(bytes);
  
  // Extract text between BT and ET markers (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
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
  
  if (text.length === 0) {
    const streamRegex = /stream\s([\s\S]*?)endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(str)) !== null) {
      const content = streamMatch[1];
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
