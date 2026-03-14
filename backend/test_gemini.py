import requests
import json

url = "http://127.0.0.1:8000/api/content/generate-image"
payload = {
    "prompt": "futuristic cyberpunk city",
    "style": "cinematic lighting",
    "event_name": "Test Event",
    "image_type": "Event Poster",
    "width": 1024,
    "height": 1024
}
headers = {'Content-Type': 'application/json'}

print("Testing Image Generation API...")
response = requests.post(url, headers=headers, data=json.dumps(payload))

print(f"Status Code: {response.status_code}")
if response.status_code == 200:
    print("Response JSON:")
    print(json.dumps(response.json(), indent=2))
else:
    print("Error Response:")
    print(response.text)
