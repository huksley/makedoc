#!/bin/bash
for N in `find out -type f`; do
    echo "Uploading $N"
    mark -f $N
done
