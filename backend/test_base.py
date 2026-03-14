import os
from dotenv import load_dotenv

load_dotenv(override=True)

google_key = os.getenv("GOOGLE_API_KEY")

try:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=google_key)
    
    print("Testing gemini-2.5-flash...")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="A simple red circle on a white background",
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"]
        )
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            print("SUCCESS! Got image data.")
            break
    else:
        print("FAILED: No inline data.")
except Exception as e:
    print(e)
