# SimpleVideoServer
A Simple node based server and app that lets you play the videos in a given directory in your browser.

## Installation
Go into the "backend" directory and install the node module "node-static":

```
npm install node-static
```

## Running
Still in the "backend" directory, start the server using

```
node localServer.js --port=8080 --data=/path/to/my/videos
```

This will start a web-server on port 8080 and show all ".webm", ".mp4", ".ogg" and ".mov" files in a list. When you click on an entry in the list, the video will start playing.

## Details
A file names ".mediaIndex.json" will be created in the data folder where the metadata about the videos is saved. This way ratings can be saved next to the videos and the video list can be ordered by rating.
