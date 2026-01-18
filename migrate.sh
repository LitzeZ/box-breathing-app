#!/bin/bash

# Define destination
DEST="$HOME/Projects/MeditationApp"

# Check if destination exists
if [ -d "$DEST" ]; then
    echo "Directory $DEST already exists. Backing up..."
    mv "$DEST" "${DEST}_backup_$(date +%s)"
fi

# Create destination
mkdir -p "$DEST"

# Copy files (excluding this script and potential system junk)
# Using rsync for better control if available, else cp
if command -v rsync &> /dev/null; then
    rsync -av --progress . "$DEST" --exclude '.DS_Store' --exclude 'migrate.sh'
else
    cp -R . "$DEST"
fi

echo "Migration finished. Files are in $DEST"
