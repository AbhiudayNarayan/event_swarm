import os
from dotenv import load_dotenv

load_dotenv(override=True)

google_key = os.getenv("GOOGLE_API_KEY")

try:
    from google import genai
    client = genai.Client(api_key=google_key)
    
    for m in client.models.list():
        if "generateContent" in m.supported_generation_methods:
            if "image" in m.name.lower() or "vision" in m.name.lower() or "flash" in m.name.lower():
                print(f"Content Method Supported: {m.name}")
except Exception as e:
    print(e)
