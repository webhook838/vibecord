from setuptools import setup

APP = ['desktop.py']
OPTIONS = {
    'argv_emulation': False,
    'site_packages': True,
    'packages': ['webview', 'certifi', 'objc', 'Foundation', 'AppKit', 'WebKit'],
    'includes': ['PyObjCTools', 'PyObjCTools.AppHelper'],
    'plist': {
        'CFBundleName': 'VibeCord',
        'CFBundleDisplayName': 'VibeCord',
        'CFBundleIdentifier': 'com.webhook838.vibecord',
        'CFBundleVersion': '1.0.0',
    }
}

setup(
    app=APP,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
