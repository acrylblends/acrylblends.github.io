# Music

A starter kit grown from Blank: a step sequencer and drum machine. Four tracks (kick, snare, clap, tom), 8 or 16 steps, a tempo, and patterns you save by name. The sounds
are synthesized in the browser with WebAudio, so there is nothing to download. The pattern lives in your project (`.acryl/music.json`).

```bash
acryl new my-beats --from acryl.music
my-beats/bin/acryl web
```

The app opens on the drum machine, with the agent beside it. Press Play (or the space bar) and talk to it: "make a 128 bpm techno beat", "add a snare on 2 and 4",
"slow it down to 90", "save this as warehouse". The grid changes as the agent works, and the pattern keeps playing. Then ask the builder inside to extend it: a hi-hat track, swing, a bass line. The project
is yours: private and proprietary until you decide otherwise. This starter's code is MIT licensed.
