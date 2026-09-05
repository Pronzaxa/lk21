import argparse
from onnxruntime.quantization import quantize_dynamic, QuantType
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');a=p.parse_args()
 quantize_dynamic(a.input,a.output,weight_type=QuantType.QInt8)
