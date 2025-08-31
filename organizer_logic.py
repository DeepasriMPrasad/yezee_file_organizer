import os
import shutil
from datetime import datetime
import logging
import re
import hashlib

# --- Optional Dependencies ---
try:
    from mutagen.easyid3 import EasyID3
    from mutagen.id3 import ID3NoHeaderError
    from mutagen import File as MutagenFile
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

try:
    from pymediainfo import MediaInfo
    PYMEDIAINFO_AVAILABLE = True
except ImportError:
    PYMEDIAINFO_AVAILABLE = False

try:
    import exifread
    EXIFREAD_AVAILABLE = True
except ImportError:
    EXIFREAD_AVAILABLE = False


# --- Setup Logger ---
logger = logging.getLogger(__name__)


# --- Configuration ---
TYPE_CATEGORIES = {
    "Images": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".svg", ".ico", ".heif", ".heic", ".avif", ".cr2", ".nef", ".arw", ".dng"],
    "Videos": [".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv", ".3gp", ".wmv", ".mpeg", ".mpg"],
    "Audio": [".mp3", ".wav", ".ogg", ".flac", ".aac", ".wma", ".aiff", ".mid", ".midi"],
    "Documents": [".pdf", ".doc", ".docx", ".odt", ".txt", ".rtf", ".md"],
    "Spreadsheets": [".xls", ".xlsx", ".ods", ".csv"],
    "Presentations": [".ppt", ".pptx", ".odp"],
    "Archives": [".zip", ".rar", ".7z", ".gz", ".tar", ".bz2"],
    "Executables & Installers": [".exe", ".dll", ".sh", ".dmg", ".jar", ".msi", ".bat"],
    "Code & Scripts": [".py", ".js", ".ts", ".jsx", ".tsx", ".sh", ".php", ".rb", ".html", ".css", ".json", ".xml", ".java", ".c", ".cpp", ".h", ".sql"],
}

IGNORED_SYSTEM_FILES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}

def get_dependency_status():
    """Returns a dictionary indicating which optional libraries are installed."""
    return {
        "mutagen": MUTAGEN_AVAILABLE,
        "pymediainfo": PYMEDIAINFO_AVAILABLE,
        "exifread": EXIFREAD_AVAILABLE
    }

def is_directory_truly_empty(path):
    try:
        for item in os.listdir(path):
            if item not in IGNORED_SYSTEM_FILES: return False
        return True
    except OSError:
        return False

def get_file_category(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    for category, extensions in TYPE_CATEGORIES.items():
        if ext in extensions: return category
    return "Other Files"

def get_photo_metadata(file_path):
    metadata = {}
    if not EXIFREAD_AVAILABLE: return metadata
    try:
        with open(file_path, 'rb') as f:
            tags = exifread.process_file(f, details=False, stop_tag='EXIF DateTimeOriginal')
            if 'Image Make' in tags and 'Image Model' in tags:
                make = str(tags['Image Make']).strip()
                model = str(tags['Image Model']).strip()
                if model.startswith(make):
                    model = model[len(make):].strip()
                metadata['camera'] = f"{make} {model}"

            if 'EXIF DateTimeOriginal' in tags:
                date_str = str(tags['EXIF DateTimeOriginal'])
                parts = date_str.split(' ')[0].split(':')
                if len(parts) == 3 and parts[0] != '0000':
                    metadata['year_month'] = f"{parts[0]}-{parts[1]}"
    except Exception as e:
        logger.warning(f"Could not read EXIF data for {file_path}: {e}")
    return metadata

def get_media_metadata(file_path, ext):
    metadata = {}
    if MUTAGEN_AVAILABLE and ext in TYPE_CATEGORIES["Audio"]:
        try:
            audio = MutagenFile(file_path, easy=True)
            if audio:
                if 'artist' in audio: metadata['artist'] = audio['artist'][0]
                if 'album' in audio: metadata['album'] = audio['album'][0]
                if 'date' in audio: metadata['year'] = str(audio['date'][0]).split('-')[0]
        except (ID3NoHeaderError, Exception) as e:
            logger.warning(f"Could not read audio metadata for {file_path}: {e}")

    elif PYMEDIAINFO_AVAILABLE and ext in TYPE_CATEGORIES["Videos"]:
        try:
            media_info = MediaInfo.parse(file_path)
            general_track = next((t for t in media_info.tracks if t.track_type == 'General'), None)
            if general_track and general_track.encoded_date:
                date_str = str(general_track.encoded_date)
                match = re.search(r'\b(\d{4})\b', date_str)
                if match:
                    metadata['year'] = match.group(1)
        except Exception as e:
            logger.warning(f"Could not read video metadata for {file_path}: {e}")

    elif EXIFREAD_AVAILABLE and ext in TYPE_CATEGORIES["Images"]:
        metadata.update(get_photo_metadata(file_path))

    return metadata


def scan_directory_for_files(directory, depth):
    logger.info(f"Starting directory scan at '{directory}' with depth {depth}.")
    files_metadata = []
    directory = os.path.abspath(directory)
    initial_depth = directory.count(os.sep)
    for root, dirs, filenames in os.walk(directory, topdown=True):
        if depth != -1 and (root.count(os.sep) - initial_depth) >= depth:
            dirs[:] = []
        for filename in filenames:
            if filename in IGNORED_SYSTEM_FILES: continue
            full_path = os.path.join(root, filename)
            try:
                stat = os.stat(full_path)
                ext = os.path.splitext(filename)[1].lower()
                files_metadata.append({
                    "name": filename, "path": full_path, "size": stat.st_size,
                    "lastModified": stat.st_mtime, "dateCreated": stat.st_ctime,
                    "is_duplicate": None, "metadata": get_media_metadata(full_path, ext)
                })
            except (FileNotFoundError, PermissionError) as e:
                logger.error(f"Could not access file '{full_path}': {e}")
    logger.info(f"Scan complete. Found {len(files_metadata)} files.")
    return files_metadata

def calculate_file_hash(path):
    sha256 = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()
    except (IOError, PermissionError) as e:
        logger.error(f"Could not hash file {path}: {e}")
        return None

def identify_duplicates(files_metadata):
    logger.info("Starting duplicate file identification.")
    by_size = {}
    for file_info in files_metadata:
        by_size.setdefault(file_info['size'], []).append(file_info)

    for file_info in files_metadata:
        file_info['is_duplicate'] = False

    duplicates_found = 0
    for size_group in by_size.values():
        if len(size_group) < 2: continue
        by_hash = {}
        for file_info in size_group:
            file_hash = calculate_file_hash(file_info['path'])
            if file_hash:
                by_hash.setdefault(file_hash, []).append(file_info)
        for hash_group in by_hash.values():
            if len(hash_group) > 1:
                for file_info in hash_group[1:]:
                    file_info['is_duplicate'] = True
                    duplicates_found += 1
    logger.info(f"Duplicate identification complete. Found {duplicates_found} duplicate files.")
    return files_metadata

def get_folder_name_for_criterion(file_metadata, criterion, options, index=-1):
    meta = file_metadata.get('metadata', {})
    modified_date = datetime.fromtimestamp(file_metadata['lastModified'])
    created_date = datetime.fromtimestamp(file_metadata['dateCreated'])

    def format_date(date, fmt):
        if fmt == 'yyyy': return date.strftime('%Y')
        if fmt == 'yyyy-mm': return date.strftime('%Y-%m')
        if fmt == 'yyyy-mm-dd': return date.strftime('%Y-%m-%d')
        if fmt == 'mm-dd': return date.strftime('%m-%d')
        if fmt == 'dd': return date.strftime('%d')
        return ""

    if criterion == 'type': return get_file_category(file_metadata['path'])
    elif criterion == 'extension':
        ext = os.path.splitext(file_metadata['name'])[1]
        return ext[1:].upper() + " Files" if ext else "No Extension"
    elif criterion.startswith('date_modified_'): return format_date(modified_date, criterion.replace('date_modified_', ''))
    elif criterion.startswith('date_created_'): return format_date(created_date, criterion.replace('date_created_', ''))
    elif criterion == 'alphabet':
        first_char = file_metadata['name'][0].upper()
        return first_char if first_char.isalpha() else "#"
    elif criterion == 'size':
        size_kb = file_metadata['size'] / 1024
        if size_kb < 100: return "Tiny (0 KB - 100 KB)"
        if size_kb < 1024: return "Small (100KB - 1MB)"
        if size_kb < 102400: return "Medium (1MB - 100MB)"
        return "Large (100MB plus)"
    elif criterion == 'duplicates':
        is_dup = file_metadata.get('is_duplicate')
        if is_dup is None: return "Duplicates (Not Scanned)"
        return "Duplicate Files" if is_dup else "Unique Files"
    elif criterion == 'files_per_folder':
        if index == -1: return "Files_per_Folder"
        batch_size = options.get('files_per_folder', 100)
        start = (index // batch_size) * batch_size + 1
        end = start + batch_size - 1
        return f"{start:04d}-{end:04d}"
    elif criterion == 'first_n_chars':
        n = options.get('first_n_chars', 3)
        filename = os.path.splitext(file_metadata['name'])[0]
        return filename[:n] if filename else "---"
    elif criterion == 'music_artist': return meta.get('artist', 'Unknown Artist')
    elif criterion == 'music_album': return meta.get('album', 'Unknown Album')
    elif criterion == 'music_year': return meta.get('year', 'Unknown Year')
    elif criterion == 'music_year_album':
        year = meta.get('year', 'Unknown Year')
        album = meta.get('album', 'Unknown Album')
        return f"{year} - {album}"
    elif criterion == 'video_year': return meta.get('year', 'Unknown Year')
    elif criterion == 'photo_camera_make_model': return meta.get('camera', 'Unknown Camera')
    elif criterion == 'photo_year_month': return meta.get('year_month', 'Unknown Date')
    return "Uncategorized"

def _generate_folder_and_file_names(config):
    """A non-mutating function to generate the final structure for preview or execution."""
    files_to_process = config.get('filesToProcess', [])
    files_to_process.sort(key=lambda x: x['name'])

    pri_crit, sec_crit = config.get('organizeByPrimary'), config.get('organizeBySecondary')
    opts = config.get('organizationOptions', {})

    final_plan = {}

    file_counters, p_folder_map, s_folder_map = {}, {}, {}

    for index, file_data in enumerate(files_to_process):
        p_raw = get_folder_name_for_criterion(file_data, pri_crit, opts, index)
        s_raw = get_folder_name_for_criterion(file_data, sec_crit, opts, -1) if sec_crit != 'none' else None

        p_final, s_final = p_raw, s_raw
        f_prefix, f_suffix = opts.get('folderPrefix', ''), opts.get('folderSuffix', '')
        inc_folder_prefix, inc_folder_suffix = opts.get('filenameIncrementalPrefix', False), opts.get('filenameIncrementalSuffix', False)

        if s_final:
            modified_secondary = s_raw
            if inc_folder_prefix or inc_folder_suffix:
                if p_raw not in s_folder_map: s_folder_map[p_raw] = {}
                if s_raw not in s_folder_map[p_raw]: s_folder_map[p_raw][s_raw] = len(s_folder_map[p_raw]) + 1
                num_str = str(s_folder_map[p_raw][s_raw]).zfill(4)
                if inc_folder_prefix: modified_secondary = f"{num_str}_{s_raw}"
                if inc_folder_suffix: modified_secondary = f"{s_raw}_{num_str}"
            s_final = f"{f_prefix}{modified_secondary}{f_suffix}"
            dest_sub_path = os.path.join(p_final, s_final)
        else:
            modified_primary = p_raw
            if inc_folder_prefix or inc_folder_suffix:
                if p_raw not in p_folder_map: p_folder_map[p_raw] = len(p_folder_map) + 1
                num_str = str(p_folder_map[p_raw]).zfill(4)
                if inc_folder_prefix: modified_primary = f"{num_str}_{p_raw}"
                if inc_folder_suffix: modified_primary = f"{p_raw}_{num_str}"
            p_final = f"{f_prefix}{modified_primary}{f_suffix}"
            dest_sub_path = p_final

        dest_folder_key = dest_sub_path
        file_counters[dest_folder_key] = file_counters.get(dest_folder_key, 0) + 1
        idx_in_folder = file_counters[dest_folder_key]

        base, ext = os.path.splitext(file_data['name'])
        prefix, suffix = opts.get('filenamePrefix', ''), opts.get('filenameSuffix', '')
        if opts.get('filenameIncrementalPrefix'):
            num_prefix = str(idx_in_folder).zfill(4)
            prefix = f"{prefix}{num_prefix}" if prefix else num_prefix
        if opts.get('filenameIncrementalSuffix'):
            num_suffix = str(idx_in_folder).zfill(4)
            suffix = f"{suffix}{num_suffix}" if suffix else num_suffix

        new_filename = f"{prefix+'_' if prefix else ''}{base}{'_'+suffix if suffix else ''}{ext}"

        final_relative_path = os.path.join(dest_sub_path, new_filename)
        final_plan[final_relative_path] = file_data

    return final_plan

def generate_preview_structure(config):
    """Generates a dictionary representing the planned folder structure for the UI."""
    final_plan = _generate_folder_and_file_names(config)
    tree = {}
    for rel_path in final_plan.keys():
        parts = rel_path.replace('\\', '/').split('/')
        filename = parts.pop()

        current_level = tree
        for part in parts:
            if part not in current_level:
                current_level[part] = {}
            current_level = current_level[part]

        if not isinstance(current_level.get('__files__'), list):
            current_level['__files__'] = []
        current_level['__files__'].append(filename)

    def finalize_tree(node):
        if "__files__" in node:
            files = sorted(node.pop('__files__'))
            if not node:  # Leaf directory
                return files

        for key, value in node.items():
            node[key] = finalize_tree(value)
        return node

    return finalize_tree(tree)

def targeted_folder_cleanup(root_organizing_dir, log, undo_actions):
    """Performs a comprehensive, bottom-up scan and removal of empty directories."""
    log_msg = "--- Starting comprehensive cleanup of empty folders ---"
    log.append(log_msg)
    logger.info(log_msg)
    deleted_count = 0

    # Walk the directory tree from the bottom up
    for dirpath, _, _ in os.walk(root_organizing_dir, topdown=False):
        # Safety check: never delete the root folder itself
        if os.path.abspath(dirpath) == os.path.abspath(root_organizing_dir):
            continue
        try:
            if is_directory_truly_empty(dirpath):
                os.rmdir(dirpath)
                rel_path = os.path.relpath(dirpath, root_organizing_dir)
                msg = f"Cleaning up empty folder: '{rel_path}'"
                log.append(msg)
                logger.info(msg)
                undo_actions.append({'action': 'deleted_folder', 'path': dirpath})
                deleted_count += 1
        except OSError as e:
            err_msg = f"Could not remove '{os.path.relpath(dirpath, root_organizing_dir)}': {e}"
            log.append(f"[ERROR] {err_msg}")
            logger.error(err_msg)

    return deleted_count

def execute_organization_plan(config):
    ui_log, undo_actions = [], []
    source_dir, target_dir = config.get('sourceDirectory'), config.get('targetDirectory')
    logger.info(f"--- Executing organization: source '{source_dir}' -> target '{target_dir}' ---")

    if not target_dir or not os.path.isdir(target_dir): raise ValueError("Target directory is not valid.")

    final_plan = _generate_folder_and_file_names(config)
    if not final_plan:
        ui_log.append("No files to organize. Aborting."); logger.warning(ui_log[-1])
        return ui_log, []

    op, op_str = (shutil.move, "Moving") if config.get('operation') == 'move' else (shutil.copy2, "Copying")
    processed, errors = 0, 0
    created_folders = set()

    ui_log.append(f"--- Starting organization of {len(final_plan)} files ---")

    for dest_rel_path, file_data in final_plan.items():
        try:
            src_path = file_data['path']
            if not os.path.exists(src_path):
                ui_log.append(f"Skipping '{file_data['name']}' (file no longer at source)"); errors += 1; continue

            dest_file_path = os.path.join(target_dir, dest_rel_path)
            dest_path = os.path.dirname(dest_file_path)

            if not os.path.exists(dest_path): created_folders.add(dest_path)
            os.makedirs(dest_path, exist_ok=True)

            if os.path.exists(dest_file_path):
                counter = 1
                base, ext = os.path.splitext(dest_file_path)
                while os.path.exists(dest_file_path):
                    dest_file_path = f"{base}_{counter}{ext}"
                    counter += 1

            op(src_path, dest_file_path)

            if config.get('operation') == 'move':
                undo_actions.append({'action': 'move', 'from': dest_file_path, 'to': src_path})
            elif config.get('operation') == 'copy':
                undo_actions.append({'action': 'copied_file', 'path': dest_file_path})

            ui_log.append(f"{op_str} '{file_data['name']}' to '{os.path.relpath(dest_file_path, target_dir)}'"); processed += 1
        except Exception as e:
            ui_log.append(f"[ERROR] Failed to process '{file_data['name']}': {e}"); errors += 1
            logger.error(f"Failed to process '{file_data['name']}': {e}", exc_info=True)

    op_past = "Moved" if config.get('operation') == 'move' else "Copied"
    summary = f"{op_past} {processed} of {len(final_plan)} files successfully."
    if errors: summary += f" Encountered {errors} error(s)."
    summary_header = "="*20 + " ORGANIZATION SUMMARY " + "="*20
    ui_log.insert(0, summary); ui_log.insert(0, summary_header)
    ui_log.append("=" * len(summary_header))
    logger.info(summary)

    if config.get('deleteEmptyFolders') and config.get('operation') == 'move':
        deleted = targeted_folder_cleanup(source_dir, ui_log, undo_actions)
        cleanup_summary = f"CLEANUP SUMMARY: Removed {deleted} empty source folder(s)."
        ui_log.extend(["\n", "="*22 + " CLEANUP REPORT " + "="*22, cleanup_summary, "="*len(summary_header)])
        logger.info(cleanup_summary)

    for folder in created_folders: undo_actions.append({'action': 'created_folder', 'path': folder})
    logger.info("--- Organization plan execution finished. ---")
    return ui_log, undo_actions


def execute_undo(undo_actions, target_dir):
    ui_log = []
    logger.info(f"--- Starting UNDO operation for {len(undo_actions)} actions. ---")

    moved, restored, deleted_copied = 0, 0, 0
    errors = 0
    deleted_file_parents = set()

    undo_actions.reverse()

    for action in undo_actions:
        try:
            action_type = action.get('action')
            path = action.get('path')

            if action_type == 'move':
                os.makedirs(os.path.dirname(action['to']), exist_ok=True)
                shutil.move(action['from'], action['to'])
                ui_log.append(f"Moved back '{os.path.basename(action['to'])}'"); moved += 1

            elif action_type == 'copied_file':
                try:
                    deleted_file_parents.add(os.path.dirname(path))
                    os.remove(path)
                    ui_log.append(f"Deleted copied file '{os.path.basename(path)}'"); deleted_copied += 1
                except FileNotFoundError:
                    logger.warning(f"Undo: Could not find copied file to delete: {path}")

            elif action_type == 'deleted_folder':
                os.makedirs(path, exist_ok=True)
                ui_log.append(f"Restored folder '{os.path.relpath(path, target_dir)}'"); restored += 1

            elif action_type == 'created_folder':
                # This check happens at the end, after files are removed
                pass

        except Exception as e:
            ui_log.append(f"[ERROR] Failed to undo action {action}: {e}"); errors += 1
            logger.error(f"Failed to undo action {action}: {e}", exc_info=True)

    all_created_folders = [a['path'] for a in undo_actions if a.get('action') == 'created_folder']
    if deleted_copied > 0 or all_created_folders:
        ui_log.append("--- Starting cleanup of empty folders from undo ---")
        folders_to_check = deleted_file_parents.union(set(all_created_folders))
        deleted_count = 0
        for folder in sorted(list(folders_to_check), key=len, reverse=True):
            try:
                if is_directory_truly_empty(folder):
                    os.rmdir(folder)
                    ui_log.append(f"Cleaned up empty folder: '{os.path.relpath(folder, target_dir)}'")
                    deleted_count += 1
            except OSError as e:
                logger.warning(f"Undo: Could not remove empty folder '{folder}': {e}")
        if deleted_count > 0: ui_log.append(f"Removed {deleted_count} empty folders.")


    summary = f"UNDO SUMMARY: Moved back {moved} files, deleted {deleted_copied} copied files, and restored {restored} folders."
    if errors: summary += f" Encountered {errors} error(s)."
    summary_header = "="*25 + " UNDO SUMMARY " + "="*25
    ui_log.insert(0, summary); ui_log.insert(0, summary_header)
    ui_log.append("=" * len(summary_header))
    logger.info("--- UNDO operation finished. ---")
    return ui_log

