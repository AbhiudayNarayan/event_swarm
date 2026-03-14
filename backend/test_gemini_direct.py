import os
from google import genai
from google.genai import types

client = genai.Client(api_key="PASTE_YOUR_KEY_HERE")

response = client.models.generate_content(
    model="gemini-2.0-flash-preview-image-generation",
    contents="a simple red circle on white background",
    config=types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"]
    )
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        with open("test_output.png", "wb") as f:
            f.write(part.inline_data.data)
        print("SUCCESS — test_output.png saved")
        break
else:
    print("FAILED — no image in response")
    print(response)