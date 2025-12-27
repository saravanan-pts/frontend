const fs = require('fs');

const path = require('path');



console.log("[START] Script initialized.");



// --- CONFIGURATION ---

const API_URL = "http://localhost:3111/api/process";

const CHUNK_SIZE = 10; // Process 10 rows per request (Prevents Timeouts)



// The 4 files you need to import

const FILES_TO_UPLOAD = [

  "/home/ubuntu/example/car_insurance_datasets/Account_Lifecycle_Log.csv",

  "/home/ubuntu/example/car_insurance_datasets/Call_Center_Sales_Log_CLEAN.csv",

  "/home/ubuntu/example/car_insurance_datasets/Claim_Processing_Event_Log_CLEAN.csv",

  "/home/ubuntu/example/car_insurance_datasets/Claims_Document_Log_CLEAN.csv"

];



// Helper to pause execution (prevents rate limiting)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));



async function uploadFileInChunks(filePath) {

  const fileName = path.basename(filePath);

  console.log(`\n========================================`);

  console.log(`[FILE] Processing: ${fileName}`);

  console.log(`[PATH] ${filePath}`);



  try {

    if (!fs.existsSync(filePath)) {

      console.error(`[ERROR] File not found.`);

      return;

    }



    // 1. Read & Split Lines

    const content = fs.readFileSync(filePath, 'utf-8');

    // Split by newline and remove empty lines

    const allLines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

    

    // Extract Header (assuming CSV)

    const header = allLines[0]; 

    const dataLines = allLines.slice(1);

    

    console.log(`[INFO] Total Rows: ${dataLines.length}`);

    console.log(`[INFO] Chunk Size: ${CHUNK_SIZE} rows per request`);



    // 2. Process in Chunks

    let totalEntities = 0;

    let totalRels = 0;

    let chunkIndex = 1;

    const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);



    for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {

        // Prepare Chunk: Header + Batch of Rows

        const chunkRows = dataLines.slice(i, i + CHUNK_SIZE);

        const chunkContent = [header, ...chunkRows].join("\n");

        

        console.log(`    Chunk ${chunkIndex}/${totalChunks} (${chunkRows.length} rows)...`);



        // Retry Logic for Stability

        let attempts = 0;

        let success = false;

        

        while(attempts < 3 && !success) {

            try {

                // Check if fetch exists (Node 18+)

                if (typeof fetch === 'undefined') throw new Error("Node 18+ required");



                // Set a high timeout signal (5 minutes)

                const controller = new AbortController();

                const timeoutId = setTimeout(() => controller.abort(), 300000);



                const response = await fetch(API_URL, {

                    method: "POST",

                    headers: { "Content-Type": "application/json" },

                    body: JSON.stringify({

                        textContent: chunkContent,

                        fileName: `${fileName}_part${chunkIndex}`, // Unique name per chunk

                        approvedMapping: [] 

                    }),

                    signal: controller.signal

                });

                

                clearTimeout(timeoutId);



                if (response.ok) {

                    const result = await response.json();

                    totalEntities += result.stats?.entitiesInserted || 0;

                    totalRels += result.stats?.relsInserted || 0;

                    success = true;

                } else {

                    const text = await response.text();

                    throw new Error(`Server Error: ${text.slice(0, 100)}`);

                }

            } catch (err) {

                attempts++;

                console.error(`       Attempt ${attempts} failed: ${err.message}`);

                await sleep(2000 * attempts); // Backoff wait

            }

        }

        

        if(!success) {

            console.error(`    Failed Chunk ${chunkIndex}. Skipping...`);

        }



        chunkIndex++;

        // Small pause between chunks to let DB/AI breathe

        await sleep(500); 

    }



    console.log(`\n Finished ${fileName}`);

    console.log(`   - Total Entities: ${totalEntities}`);

    console.log(`   - Total Relationships: ${totalRels}`);



  } catch (error) {

    console.error(`[SYSTEM ERROR] ${error.message}`);

  }

}



async function runAll() {

  console.log(`[BATCH] Starting sequential upload...`);

  

  for (const filePath of FILES_TO_UPLOAD) {

    await uploadFileInChunks(filePath);

  }



  console.log(`\n All uploads finished.`);

}



runAll();