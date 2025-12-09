#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import re
from collections import defaultdict

# MongoDB connection info
MONGO_URI = "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
DB_NAME = "hiking"
COLLECTION_NAME = "Mountain_list"
CONTAINER_NAME = "hiking-mongodb"

def remove_parentheses_from_name(name):
    """Remove content inside parentheses from name"""
    if not name:
        return name
    # Remove everything inside parentheses including the parentheses
    return re.sub(r'\([^)]*\)', '', name).strip()

def update_mountain_names():
    """Update mountain names: remove parentheses, then add location for duplicates"""
    
    print("=" * 50)
    print("Updating mountain names in MongoDB")
    print("=" * 50)
    print()
    
    # Step 1: Export all data
    print("Step 1: Exporting all data from MongoDB...")
    export_cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mongoexport",
        "--uri", MONGO_URI,
        "--collection", COLLECTION_NAME,
        "--out", "/tmp/mountains_export.json",
        "--jsonArray"
    ]
    
    result = subprocess.run(export_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error exporting data: {result.stderr}")
        sys.exit(1)
    
    print("✓ Data exported")
    print()
    
    # Step 2: Copy and read data
    print("Step 2: Reading exported data...")
    subprocess.run(
        ["docker", "cp", f"{CONTAINER_NAME}:/tmp/mountains_export.json", "/tmp/mountains_export.json"],
        check=True
    )
    
    with open("/tmp/mountains_export.json", 'r', encoding='utf-8') as f:
        mountains = json.load(f)
    
    print(f"✓ Read {len(mountains)} mountains")
    print()
    
    # Step 3: Remove parentheses from all names
    print("Step 3: Removing parentheses from all names...")
    for mountain in mountains:
        if 'name' in mountain:
            mountain['name'] = remove_parentheses_from_name(mountain['name'])
    
    print("✓ Parentheses removed from all names")
    print()
    
    # Step 4: Find duplicates and add location to name
    print("Step 4: Finding duplicates and adding location to name...")
    name_groups = defaultdict(list)
    
    for idx, mountain in enumerate(mountains):
        name = mountain.get('name', '')
        if name:
            name_groups[name].append(idx)
    
    duplicates_found = 0
    for name, indices in name_groups.items():
        if len(indices) > 1:
            duplicates_found += len(indices)
            # Add location to name for all duplicates
            for idx in indices:
                location = mountains[idx].get('location', '')
                if location:
                    mountains[idx]['name'] = f"{name}({location})"
                else:
                    # If no location, keep original name (shouldn't happen but just in case)
                    pass
    
    print(f"✓ Found {len([g for g in name_groups.values() if len(g) > 1])} duplicate name groups")
    print(f"✓ Updated {duplicates_found} mountains with duplicate names")
    print()
    
    # Step 5: Save updated data
    print("Step 5: Saving updated data...")
    with open("/tmp/mountains_updated.json", 'w', encoding='utf-8') as f:
        json.dump(mountains, f, ensure_ascii=False, indent=2)
    
    print("✓ Updated data saved")
    print()
    
    # Step 6: Clear collection and import updated data
    print("Step 6: Clearing collection and importing updated data...")
    
    # Clear collection
    clear_js = f"""
    db = db.getSiblingDB('{DB_NAME}');
    var result = db.{COLLECTION_NAME}.deleteMany({{}});
    print('Deleted ' + result.deletedCount + ' documents');
    """
    
    temp_js = "/tmp/clear_collection.js"
    with open(temp_js, 'w', encoding='utf-8') as f:
        f.write(clear_js)
    
    subprocess.run(
        ["docker", "cp", temp_js, f"{CONTAINER_NAME}:/tmp/clear_collection.js"],
        check=True
    )
    
    clear_cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mongosh", DB_NAME,
        "--quiet",
        "--file", "/tmp/clear_collection.js",
        "--username", "admin",
        "--password", "admin123",
        "--authenticationDatabase", "admin"
    ]
    
    result = subprocess.run(clear_cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ {result.stdout.strip()}")
    else:
        print(f"Error clearing collection: {result.stderr}")
        sys.exit(1)
    
    # Import updated data
    subprocess.run(
        ["docker", "cp", "/tmp/mountains_updated.json", f"{CONTAINER_NAME}:/tmp/mountains_updated.json"],
        check=True
    )
    
    import_cmd = [
        "docker", "exec", CONTAINER_NAME,
        "bash", "-lc",
        f'mongoimport --uri="{MONGO_URI}" --collection={COLLECTION_NAME} --jsonArray --file=/tmp/mountains_updated.json'
    ]
    
    result = subprocess.run(import_cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Successfully imported {len(mountains)} documents")
        print(result.stdout)
    else:
        print(f"Error importing data: {result.stderr}")
        if result.stdout:
            print(result.stdout)
        sys.exit(1)
    
    # Cleanup
    os.remove(temp_js)
    os.remove("/tmp/mountains_export.json")
    os.remove("/tmp/mountains_updated.json")
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", "/tmp/mountains_export.json", "/tmp/mountains_updated.json", "/tmp/clear_collection.js"],
        check=False
    )
    
    print()
    print("=" * 50)
    print("Update completed successfully!")
    print("=" * 50)

if __name__ == "__main__":
    update_mountain_names()




