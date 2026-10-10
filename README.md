# gno-fish trên Arc testnet

Bản thử của luật **fishduel** trên Arc. Đây không phải bộ NFT `shoal/fish` trên Onyx, không phát hành FISH, và không đụng `gnofish.xyz`.

Nguồn luật là `gno.land/r/shoal/fishduel` trong [sunny-0x42/gno-fish](https://github.com/sunny-0x42/gno-fish). Bơi vẫn ở ngoài chain. Hợp đồng chỉ nhận mint, đặt cược, settle một nhát cắn đã được ký, và leave.

## Mạng

| | |
| --- | --- |
| Mạng | Arc Testnet |
| Chain id | `5042002` |
| RPC | `https://rpc.testnet.arc.io` |
| Gas | USDC native, 18 chữ số thập phân |
| Explorer | https://explorer.testnet.arc.io/address/0x55675f0415E8313F47cb290B874DCbC00cfd3642 |

`1e18` wei là 1 USDC và, trong bản thử này, đứng vai 1 GNOT của fishduel. Mint đúng 1 USDC. Cược tối thiểu 1 USDC. Tối đa 8 cá, và chỉ 2 cá được ngồi trong biển cùng lúc. Không có cá máy.

## Địa chỉ

Hợp đồng `FishDuel` `fishduel-arc-1`:

`0x55675f0415E8313F47cb290B874DCbC00cfd3642`

Giao dịch tạo: `0xe0f77f668f820a907b169055d18cee5cd4b2da45ae951238632de4bb7c50726a`

Source đã được verify trên explorer.

Ba két phải khác nhau. Chúng là ba địa chỉ đầu của cùng một seed, đường `m/44'/60'/0'/0/n`.

| Két | Index | Địa chỉ | Việc nhận |
| --- | --- | --- | --- |
| Team, cũng là ví deploy | 0 | `0x8EaAe9f664214987204616Dd8145BAcad48044F6` | 30% phí mint, và 7% cược bị phủ khi có kill |
| Liquidity | 1 | `0xA7832aDE808De32006120237c5eE8d326612fac8` | 60% phí mint, 10% kill |
| Burn | 2 | `0x09ddE94a5E2F346dCD8678c6011e19bA962635c8` | 10% phí mint, 3% kill cộng phần dư làm tròn |

Phí mint rời hợp đồng ngay trong lệnh mint. Kill chia phần cược nhỏ hơn: 80% cá thắng, 10% liquidity, 3% team, 3% burn, 4% cổ vũ. Bản thử không có người cổ vũ, nên 4% đó gộp vào team. Phần dư khi chia hết nhập vào burn. Phần cược thừa của cá thua được trả lại. Cược của cá thắng nằm lại cho đến khi `leave`.

## Chữ ký

Gno gắn một khóa ed25519 lúc `Register`, vì realm không kiểm được chữ ký secp256k1 của ví. Arc kiểm được. `register` gắn một địa chỉ mark. Mark có thể là chính chủ cá hoặc một khóa phiên.

Sáu mẫu, cá thắng rồi cá thua, ba nhịp, nối bằng `/`. Mỗi mẫu là:

`bout:seq:height:id:x:z:time:secret:sig`

`secret` là 32 ký tự hex thường. `sig` là 130 ký tự hex thường, `r || s || v`. Mark ký EIP-191 cho `keccak256` của chuỗi `canon`: các số viết thập phân, nối bằng dấu phẩy, không số 0 ở đầu. Ba mẫu phải cách nhau ít nhất 2400 ms và nằm trên các block tăng dần. Đòn là `floor(69 * 100 / (88 + 100))` = 36. Nhát thứ ba phải là nhát kết liễu.

`leave` trả cược. Khi đối thủ còn ngồi, phải chờ 60 giây.

## Chạy test

Cần [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
forge install foundry-rs/forge-std@v1.17.0
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
forge test
```

`forge test` chạy 4 test: đòn 36 máu, phí mint 60/30/10, settle 1 USDC ra 0.80 / 0.10 / 0.07 / 0.03, cược không đều, và leave sau 60 giây.
