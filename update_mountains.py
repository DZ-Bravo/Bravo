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

def get_mountain_names_from_json(json_file_path):
    """Extract mountain names from JSON file"""
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print("Error: JSON file should contain an array of objects")
        sys.exit(1)
    
    names = [item.get('name') for item in data if item.get('name')]
    return names, data

def delete_old_mountains(mountain_names):
    """Delete old mountains from MongoDB by name"""
    print(f"Deleting {len(mountain_names)} old mountains from MongoDB...")
    
    # Create a JavaScript file for deletion
    js_content = f"""
    db = db.getSiblingDB('{DB_NAME}');
    var names = {json.dumps(mountain_names)};
    var result = db.{COLLECTION_NAME}.deleteMany({{name: {{$in: names}}}});
    print('Deleted ' + result.deletedCount + ' documents');
    """
    
    temp_js = "/tmp/delete_mountains.js"
    with open(temp_js, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    # Copy to container
    subprocess.run(
        ["docker", "cp", temp_js, f"{CONTAINER_NAME}:/tmp/delete_mountains.js"],
        check=True
    )
    
    # Execute deletion
    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mongosh", DB_NAME,
        "--quiet",
        "--file", "/tmp/delete_mountains.js",
        "--username", "admin",
        "--password", "admin123",
        "--authenticationDatabase", "admin"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✓ {result.stdout.strip()}")
    else:
        print(f"✗ Error deleting mountains: {result.stderr}")
        os.remove(temp_js)
        sys.exit(1)
    
    # Cleanup
    os.remove(temp_js)
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", "/tmp/delete_mountains.js"],
        check=False
    )

def import_new_mountains(data):
    """Import new mountains data to MongoDB"""
    if not data:
        print("No data to import")
        return
    
    print(f"Importing {len(data)} new mountains to MongoDB...")
    
    # Create temp file
    temp_file = f"/tmp/mountains_import.json"
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Copy to container
    subprocess.run(
        ["docker", "cp", temp_file, f"{CONTAINER_NAME}:/tmp/mountains_import.json"],
        check=True
    )
    
    # Import to MongoDB
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
    os.remove(temp_file)
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", f"/tmp/mountains_import.json"],
        check=False
    )

def main():
    json_file = "/home/bravo/new_mountains_to_add.json"
    
    if not os.path.exists(json_file):
        print(f"Error: File not found: {json_file}")
        sys.exit(1)
    
    print("=" * 50)
    print("Updating mountains in MongoDB")
    print("=" * 50)
    print()
    
    # Read new data
    print(f"Reading new data from {json_file}...")
    mountain_names, new_data = get_mountain_names_from_json(json_file)
    print(f"Found {len(mountain_names)} mountains in new file")
    print(f"Mountain names: {', '.join(mountain_names[:5])}{'...' if len(mountain_names) > 5 else ''}")
    print()
    
    # Delete old mountains
    delete_old_mountains(mountain_names)
    print()
    
    # Import new mountains
    import_new_mountains(new_data)
    print()
    
    print("=" * 50)
    print("Update completed successfully!")
    print("=" * 50)

if __name__ == "__main__":
    main()

