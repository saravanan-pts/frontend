#!/bin/bash



# Define the list of files to import



FILES=(/home/ubuntu/example/car_insurance_demo/car_ins_demo.csv)



# API Endpoint

URL="http://localhost:3111/api/process"



# Loop through each file

for FILE_PATH in "${FILES[@]}"; do

  FILE_NAME=$(basename "$FILE_PATH")

  

  echo "----------------------------------------------------------------"

  echo "Processing: $FILE_NAME"

  echo "Path: $FILE_PATH"



  # Check if file exists

  if [ ! -f "$FILE_PATH" ]; then

    echo " Error: File not found!"

    continue

  fi



  # 1. Read the CSV content safely

  # Escapes double quotes for JSON compatibility

  CONTENT=$(awk '{printf "%s\\n", $0}' "$FILE_PATH" | sed 's/"/\\"/g')



  # 2. Send as JSON

  # NOTE: We put the curl command mostly on one line to prevent "command not found" errors

  echo " Uploading..."

  

  curl -X POST "$URL" -H "Content-Type: application/json" -d "{ \"fileName\": \"$FILE_NAME\", \"textContent\": \"$CONTENT\", \"saveToMemory\": false, \"approvedMapping\": [] }"



  echo -e "\nDone with $FILE_NAME"

done



echo "----------------------------------------------------------------"

echo " All imports finished."