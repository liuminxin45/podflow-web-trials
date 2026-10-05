# PodFlow Web trials

Public archive of automatic short podcast trials. AI-generated content has not been reviewed by a person.

Each release stores one complete MP3 and its public script/source metadata. This repository is independent from the formally reviewed morning-news feed. No media is committed into Git history.

The archive workflow claims only prepared, automatically checked jobs from the website using a dedicated narrow token. It verifies the audio SHA-256, uploads with this repository's short-lived GitHub Actions token, then acknowledges the exact audio version. It does not run Python, FFmpeg, or a speech generation API.
