# transcription - speech to text

multilingual real-time transcription app powered by Gemini.

## deployed application link
https://transcription-7wxp.onrender.com/

## features
- real-time live captions while speaking (web speech api)
- accurate final transcription using gemini-3.5-flash
- supports multilingual speech (hindi, english, hinglish, and 99 other languages)
- transcription history dashboard with full crud operations
- sqlite database for persistent storage

## tech stack
- backend: python, flask
- transcription: google gemini-3.5-flash api
- database: sqlite via sqlalchemy
- frontend: vanilla html, css, javascript

## setup
1. clone the repo
2. create a virtual environment and install dependencies: `pip install -r requirements.txt`
3. create a `.env` file with your gemini api key: `GEMINI_API_KEY=your_key_here`
4. run the app: `python app.py`
5. open `http://localhost:5000`
