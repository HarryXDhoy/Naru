import io, socket, ssl, sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app

class FakeSocket:
    def __init__(self, response, addresses):
        self.response=response;self.addresses=addresses
    def settimeout(self, timeout):pass
    def setsockopt(self, *args):pass
    def connect(self, address):self.addresses.append(address)
    def sendall(self, data):pass
    def makefile(self, *args, **kwargs):return io.BytesIO(self.response)
    def close(self):pass

class PublicFetchTests(unittest.TestCase):
    @staticmethod
    def dns(address,port=443):return [(socket.AF_INET,socket.SOCK_STREAM,6,'',(address,port))]
    @staticmethod
    def response(status,body=b'',headers=b''):
        return b'HTTP/1.1 '+status+b'\r\nContent-Length: '+str(len(body)).encode()+b'\r\n'+headers+b'\r\n'+body
    def test_validated_address_is_pinned_and_tls_keeps_original_hostname(self):
        addresses=[];names=[];lookups=[]
        def resolve(host,port,**kwargs):
            lookups.append(host)
            return self.dns('93.184.216.34',port) if len(lookups)==1 else self.dns('127.0.0.1',port)
        def wrap(context,sock,server_hostname=None,**kwargs):
            names.append((server_hostname,context.check_hostname,context.verify_mode));return sock
        response=self.response(b'200 OK',b'hello',b'Content-Type: text/html; charset=utf-8\r\n')
        with patch.object(app.socket,'getaddrinfo',side_effect=resolve),patch.object(app.socket,'socket',side_effect=lambda *a:FakeSocket(response,addresses)),patch.object(ssl.SSLContext,'wrap_socket',autospec=True,side_effect=wrap):
            url,text=app.fetch_public('https://example.test/index')
        self.assertEqual((url,text),('https://example.test/index','hello'))
        self.assertEqual(lookups,['example.test'])
        self.assertEqual(addresses,[('93.184.216.34',443)])
        self.assertEqual(names,[('example.test',True,ssl.CERT_REQUIRED)])
    def test_redirect_to_private_address_is_blocked_before_connection(self):
        addresses=[];responses=[self.response(b'302 Found',headers=b'Location: http://127.0.0.1:4317/api/state\r\n')]
        def resolve(host,port,**kwargs):return self.dns('127.0.0.1' if host=='127.0.0.1' else '93.184.216.34',port)
        with patch.object(app.socket,'getaddrinfo',side_effect=resolve),patch.object(app.socket,'socket',side_effect=lambda *a:FakeSocket(responses.pop(0),addresses)):
            with self.assertRaisesRegex(ValueError,'사설 네트워크'):app.fetch_public('http://example.test/')
        self.assertEqual(addresses,[('93.184.216.34',80)])
    def test_redirect_limit_and_response_size_are_enforced(self):
        addresses=[];redirect=self.response(b'302 Found',headers=b'Location: /again\r\n')
        with patch.object(app.socket,'getaddrinfo',return_value=self.dns('93.184.216.34',80)),patch.object(app.socket,'socket',side_effect=lambda *a:FakeSocket(redirect,addresses)):
            with self.assertRaisesRegex(ValueError,'리다이렉트 한도'):app.fetch_public('http://example.test/')
        self.assertEqual(len(addresses),6)
        with patch.object(app.socket,'getaddrinfo',return_value=self.dns('93.184.216.34',80)),patch.object(app.socket,'socket',side_effect=lambda *a:FakeSocket(self.response(b'200 OK',b'123456'),[])):
            with self.assertRaisesRegex(ValueError,'제한'):app.fetch_public('http://example.test/',limit=5)
    def test_multicast_is_not_public_unicast(self):
        with patch.object(app.socket,'getaddrinfo',return_value=self.dns('224.0.0.1')):
            with self.assertRaisesRegex(ValueError,'사설 네트워크'):app.fetch_public('https://example.test/')
    def test_mixed_private_and_public_addresses_are_rejected(self):
        with patch.object(app.socket,'getaddrinfo',return_value=self.dns('93.184.216.34')+self.dns('10.0.0.1')):
            with self.assertRaisesRegex(ValueError,'사설 네트워크'):app.fetch_public('https://example.test/')

if __name__=='__main__':unittest.main()
