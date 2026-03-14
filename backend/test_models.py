import os
from dotenv import load_dotenv

load_dotenv(override=True)

google_key = os.getenv("GOOGLE_API_KEY")
if google_key:
    import google.generativeai as genai
    genai.configure(api_key=google_key)
    for m in genai.list_models():
        print(m.name)
        if 'generateContent' in m.supported_generation_methods:
            pass
else:
    print("No key")
