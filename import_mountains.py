#!/usr/bin/env python3
import json
import os
import subprocess
import sys

# MongoDB connection info
MONGO_URI = "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
DB_NAME = "hiking"
COLLECTION_NAME = "Mountain_list"
CONTAINER_NAME = "hiking-mongodb"

def import_mountains_to_mongodb(json_file_path):
    """Import mountains data from JSON file to MongoDB Mountain_list collection"""
    
    # Read JSON file
    if not os.path.exists(json_file_path):
        print(f"Error: File not found: {json_file_path}")
        sys.exit(1)
    
    print(f"Reading JSON file: {json_file_path}")
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print("Error: JSON file should contain an array of objects")
        sys.exit(1)
    
    print(f"Found {len(data)} mountains to import")
    
    # Create temp file
    temp_file = f"/tmp/mountains_import.json"
    print(f"Creating temporary file: {temp_file}")
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Copy to container
    print(f"Copying file to container {CONTAINER_NAME}...")
    try:
        subprocess.run(
            ["docker", "cp", temp_file, f"{CONTAINER_NAME}:/tmp/mountains_import.json"],
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"Error copying file to container: {e}")
        os.remove(temp_file)
        sys.exit(1)
    
    # Import to MongoDB
    print(f"Importing data to MongoDB collection '{COLLECTION_NAME}'...")
    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "bash", "-lc",
        f'mongoimport --uri="{MONGO_URI}" --collection={COLLECTION_NAME} --jsonArray --file=/tmp/mountains_import.json'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✓ Successfully imported {len(data)} documents to {COLLECTION_NAME}")
        print(result.stdout)
    else:
        print(f"✗ Error importing to {COLLECTION_NAME}:")
        print(result.stderr)
        if result.stdout:
            print(result.stdout)
        os.remove(temp_file)
        subprocess.run(
            ["docker", "exec", CONTAINER_NAME, "rm", f"/tmp/mountains_import.json"],
            check=False
        )
        sys.exit(1)
    
    # Cleanup
    print("Cleaning up temporary files...")
    os.remove(temp_file)
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", f"/tmp/mountains_import.json"],
        check=False
    )
    
    print("=" * 50)
    print("Import completed successfully!")
    print("=" * 50)

if __name__ == "__main__":
    json_file = "/home/bravo/new_mountains_to_add.json"
    import_mountains_to_mongodb(json_file)

