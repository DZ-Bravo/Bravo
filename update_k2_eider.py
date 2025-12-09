#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import glob

# MongoDB connection info
MONGO_URI = "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
DB_NAME = "hiking"
CONTAINER_NAME = "hiking-mongodb"

# Collections to delete from (main collections only, not thumbnails)
MAIN_COLLECTIONS = ["top", "bottom", "shoes", "goods"]

def delete_k2_eider_from_collections():
    """Delete all documents with brand K2 or EIDER from main collections"""
    print("=" * 50)
    print("Step 1: Deleting K2 and EIDER data from main collections")
    print("=" * 50)
    
    js_content = f"""
    db = db.getSiblingDB('{DB_NAME}');
    var collections = {json.dumps(MAIN_COLLECTIONS)};
    var totalDeleted = 0;
    
    collections.forEach(function(collectionName) {{
        var result = db[collectionName].deleteMany({{brand: {{$in: ["K2", "EIDER"]}}}});
        var deleted = result.deletedCount;
        totalDeleted += deleted;
        print(collectionName + ': Deleted ' + deleted + ' documents');
    }});
    
    print('Total deleted: ' + totalDeleted + ' documents');
    """
    
    temp_js = "/tmp/delete_k2_eider.js"
    with open(temp_js, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    # Copy to container
    subprocess.run(
        ["docker", "cp", temp_js, f"{CONTAINER_NAME}:/tmp/delete_k2_eider.js"],
        check=True
    )
    
    # Execute deletion
    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mongosh", DB_NAME,
        "--quiet",
        "--file", "/tmp/delete_k2_eider.js",
        "--username", "admin",
        "--password", "admin123",
        "--authenticationDatabase", "admin"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(result.stdout)
    else:
        print(f"✗ Error deleting data: {result.stderr}")
        os.remove(temp_js)
        sys.exit(1)
    
    # Cleanup
    os.remove(temp_js)
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", "/tmp/delete_k2_eider.js"],
        check=False
    )
    
    print()

def get_file_mapping():
    """Map files to collections based on naming pattern"""
    mapping = {
        # EIDER files
        "EIDER_bottom.json": "bottom",
        "EIDER_bottom_thumbnails.json": "bottom_thumbnails",
        "EIDER_top.json": "top",
        "EIDER_top_thumbnails.json": "top_thumbnails",
        "EIDER_outer.json": "top",  # outer goes to top
        "EIDER_outer_thumbnails.json": "top_thumbnails",  # outer thumbnails go to top_thumbnails
        "EIDER_shoes.json": "shoes",
        "EIDER_shoes_thumbnails.json": "shoes_thumbnails",
        "EIDER_goods.json": "goods",
        "EIDER_goods_thumbnails.json": "goods_thumbnails",
        
        # K2 files
        "K2_bottom.json": "bottom",
        "K2_bottom_thumbnails.json": "bottom_thumbnails",
        "K2_top.json": "top",
        "K2_top_thumbnails.json": "top_thumbnails",
        "K2_shoes.json": "shoes",
        "K2_shoes_thumbnails.json": "shoes_thumbnails",
        "K2_goods.json": "goods",
        "K2_goods_thumbnails.json": "goods_thumbnails",
    }
    return mapping

def import_file_to_collection(file_path, collection_name):
    """Import a JSON file to MongoDB collection"""
    if not os.path.exists(file_path):
        print(f"  ⚠ File not found: {file_path}")
        return False
    
    # Read JSON file
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        data = [data]
    
    if not data:
        print(f"  ⚠ No data in file: {file_path}")
        return False
    
    # Create temp file
    temp_file = f"/tmp/{os.path.basename(file_path)}"
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Copy to container
    subprocess.run(
        ["docker", "cp", temp_file, f"{CONTAINER_NAME}:{temp_file}"],
        check=True
    )
    
    # Import to MongoDB
    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "bash", "-lc",
        f'mongoimport --uri="{MONGO_URI}" --collection={collection_name} --jsonArray --file={temp_file}'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    success = result.returncode == 0
    if success:
        print(f"  ✓ Imported {len(data)} documents to {collection_name}")
    else:
        print(f"  ✗ Error importing to {collection_name}: {result.stderr}")
    
    # Cleanup
    os.remove(temp_file)
    subprocess.run(
        ["docker", "exec", CONTAINER_NAME, "rm", temp_file],
        check=False
    )
    
    return success

def import_new_data():
    """Import new K2 and EIDER data from newK2Eider directory"""
    print("=" * 50)
    print("Step 2: Importing new K2 and EIDER data")
    print("=" * 50)
    
    base_dir = "/home/bravo/LABs/newK2Eider"
    if not os.path.exists(base_dir):
        print(f"Error: Directory not found: {base_dir}")
        sys.exit(1)
    
    file_mapping = get_file_mapping()
    
    # Get all JSON files (excluding summary files)
    all_files = glob.glob(os.path.join(base_dir, "*.json"))
    files_to_import = [f for f in all_files if not os.path.basename(f).endswith("_summary.json")]
    
    print(f"Found {len(files_to_import)} files to import (excluding summary files)")
    print()
    
    # Import each file
    success_count = 0
    for file_path in sorted(files_to_import):
        filename = os.path.basename(file_path)
        if filename in file_mapping:
            collection_name = file_mapping[filename]
            print(f"Importing {filename} → {collection_name}")
            if import_file_to_collection(file_path, collection_name):
                success_count += 1
            print()
        else:
            print(f"⚠ Skipping {filename} (not in mapping)")
            print()
    
    print("=" * 50)
    print(f"Import completed: {success_count}/{len(files_to_import)} files imported successfully")
    print("=" * 50)

def main():
    print("=" * 50)
    print("Updating K2 and EIDER merchandise data")
    print("=" * 50)
    print()
    
    # Step 1: Delete old K2 and EIDER data
    delete_k2_eider_from_collections()
    
    # Step 2: Import new data
    import_new_data()
    
    print()
    print("=" * 50)
    print("All operations completed!")
    print("=" * 50)

if __name__ == "__main__":
    main()


